import { Injectable } from '@nestjs/common';

type DeployEventHandler = (event: string, data: any) => void;

@Injectable()
export class DeployEventBus {
  private listeners = new Set<DeployEventHandler>();

  subscribe(cb: DeployEventHandler): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(event: string, data: any): void {
    this.listeners.forEach((cb) => cb(event, data));
  }
}
