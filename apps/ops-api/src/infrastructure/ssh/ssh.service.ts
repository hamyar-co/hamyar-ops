import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import { Observable, Subject } from 'rxjs';
import * as fs from 'fs';

interface SshConnection {
  client: Client;
  connected: boolean;
  lastUsed: number;
}

@Injectable()
export class SshService implements OnModuleDestroy {
  private readonly logger = new Logger(SshService.name);
  private connections = new Map<string, SshConnection>();

  private getConfig(): ConnectConfig {
    const config: ConnectConfig = {
      host: process.env.SSH_HOST || '91.220.113.171',
      port: parseInt(process.env.SSH_PORT || '22'),
      username: process.env.SSH_USERNAME || 'root',
      readyTimeout: 10000,
    };

    const keyPath = process.env.SSH_KEY_PATH;
    if (keyPath && fs.existsSync(keyPath)) {
      config.privateKey = fs.readFileSync(keyPath);
    } else if (process.env.SSH_PASSWORD) {
      config.password = process.env.SSH_PASSWORD;
    }

    return config;
  }

  private async getConnection(key: string): Promise<Client> {
    const existing = this.connections.get(key);
    if (existing && existing.connected) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      client
        .on('ready', () => {
          this.connections.set(key, { client, connected: true, lastUsed: Date.now() });
          resolve(client);
        })
        .on('error', (err) => {
          this.connections.delete(key);
          reject(err);
        })
        .on('close', () => {
          const conn = this.connections.get(key);
          if (conn) conn.connected = false;
        })
        .connect(this.getConfig());
    });
  }

  async exec(command: string): Promise<string> {
    const client = await this.getConnection('default');
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        let errOutput = '';
        stream
          .on('data', (d: Buffer) => (output += d.toString()))
          .stderr.on('data', (d: Buffer) => (errOutput += d.toString()));
        stream.on('close', (code: number) => {
          if (code !== 0 && errOutput) reject(new Error(errOutput.trim()));
          else resolve(output.trim());
        });
      });
    });
  }

  stream(command: string): Observable<string> {
    const subject = new Subject<string>();
    this.getConnection('stream').then((client) => {
      client.exec(command, (err, stream) => {
        if (err) { subject.error(err); return; }
        stream
          .on('data', (d: Buffer) => subject.next(d.toString()))
          .stderr.on('data', (d: Buffer) => subject.next(d.toString()));
        stream.on('close', () => subject.complete());
      });
    }).catch((e) => subject.error(e));
    return subject.asObservable();
  }

  async ptySession(
    cols: number,
    rows: number,
    onData: (data: string) => void,
    onClose: () => void,
  ): Promise<{ write: (data: string) => void; resize: (cols: number, rows: number) => void; close: () => void }> {
    const client = new Client();
    const config = this.getConfig();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', cols, rows }, (err, stream: ClientChannel) => {
          if (err) { client.end(); return reject(err); }
          stream.on('data', (d: Buffer) => onData(d.toString()));
          stream.on('close', () => { client.end(); onClose(); });
          stream.stderr.on('data', (d: Buffer) => onData(d.toString()));

          resolve({
            write: (data) => stream.write(data),
            resize: (c, r) => stream.setWindow(r, c, 0, 0),
            close: () => { stream.end(); client.end(); },
          });
        });
      })
      .on('error', reject)
      .connect(config);
    });
  }

  async onModuleDestroy() {
    for (const conn of this.connections.values()) {
      try { conn.client.end(); } catch {}
    }
    this.connections.clear();
  }
}
