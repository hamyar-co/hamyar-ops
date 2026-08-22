#!/bin/bash

# Hamyar Ops - Provision Worker Script
# This script configures a new worker node securely for the Hamyar project.

set -e

MASTER_IP=$1
WORKER_IP=$2

if [ -z "$MASTER_IP" ] || [ -z "$WORKER_IP" ]; then
    echo "Usage: $0 <MASTER_IP> <WORKER_IP>"
    exit 1
fi

echo ">> Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

echo ">> Configuring UFW Firewall for Zero Trust..."
apt-get update && apt-get install -y ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH for ops-api to manage this server
ufw allow ssh

# Allow WireGuard VPN traffic (UDP 51820)
ufw allow 51820/udp

# Allow mTLS Docker Socket access ONLY from Master IP
ufw allow from "$MASTER_IP" to any port 2376 proto tcp

ufw --force enable
echo ">> Firewall configured. Incoming traffic blocked except SSH, VPN, and mTLS Docker from Master."

# Setup WireGuard (Skeleton)
echo ">> Setting up WireGuard Interface..."
apt-get install -y wireguard
# ... (Wireguard key generation and wg0.conf logic goes here, managed by ops-api) ...
systemctl enable wg-quick@wg0
# systemctl start wg-quick@wg0

echo ">> Worker node $WORKER_IP provisioned securely!"
