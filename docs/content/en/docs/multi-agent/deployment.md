---
title: Local Deployment Guide
description: Deploy the Multi-Agent System on Ubuntu Server with multiple CUDA GPUs
---

# Local Deployment Guide

This guide covers deploying the AIRI Multi-Agent System on Ubuntu Server with multiple NVIDIA CUDA GPUs.

## Requirements

- **OS**: Ubuntu Server 22.04+ or Ubuntu Desktop 22.04+
- **GPU**: Multiple NVIDIA GPUs with CUDA support
- **RAM**: 96GB+ recommended for 2-3 concurrent agents
- **Storage**: 100GB+ SSD for models and memory persistence

## Hardware Recommendations

For optimal performance with 3 simultaneous agents:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 8 cores | 16+ cores (AMD EPYC or Intel Xeon) |
| RAM | 64GB | 96GB+ |
| GPU | 2x RTX 3090 | 3x RTX 4090 or 2x A100 |
| VRAM | 24GB per GPU | 24GB+ per GPU |
| Storage | 100GB SSD | 500GB+ NVMe SSD |

## Installation

### 1. Install NVIDIA Drivers and CUDA

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install NVIDIA driver
sudo apt install nvidia-driver-535 -y

# Reboot
sudo reboot

# Verify driver
nvidia-smi
```

### 2. Install Docker (Recommended)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 3. Option A: Using Ollama

Ollama is the simplest way to run local LLMs.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama server
OLLAMA_HOST=0.0.0.0 ollama serve &

# Pull models for each agent
ollama pull llama3.2:latest
ollama pull llama3.2:latest  # Same model for multiple agents is fine

# Verify GPU usage
nvidia-smi
```

### 3. Option B: Using vLLM

vLLM provides high-throughput inference for production deployments.

```bash
# Create vLLM container for each GPU
docker run -d --gpus device=0 \
  -p 8000:8000 \
  --name vllm-agent1 \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --max-model-len 4096

docker run -d --gpus device=1 \
  -p 8001:8000 \
  --name vllm-agent2 \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --max-model-len 4096

# For tensor parallelism across GPUs (larger models):
docker run -d --gpus all \
  -p 8000:8000 \
  --name vllm-large \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3.2-70B-Instruct \
  --tensor-parallel-size 2 \
  --max-model-len 4096
```

### 4. Install AIRI

```bash
# Clone repository
git clone https://github.com/moeru-ai/airi.git
cd airi

# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Build packages
pnpm build:packages
```

## Configuration

### Multi-GPU Configuration

Configure GPU assignment in your config file:

```yaml
gpu:
  devices:
    - id: 0
      name: 'NVIDIA RTX 4090'
      totalMemoryMb: 24576
      freeMemoryMb: 20000
      assignedModels: ['agent1-model']
    - id: 1
      name: 'NVIDIA RTX 4090'
      totalMemoryMb: 24576
      freeMemoryMb: 24576
      assignedModels: ['agent2-model']
    - id: 2
      name: 'NVIDIA RTX 4090'
      totalMemoryMb: 24576
      freeMemoryMb: 24576
      assignedModels: ['agent3-model']
  placementStrategy: memory-aware
  fallbackBehavior: queue

session:
  agents:
    - id: alice
      name: Alice
      model:
        provider: vllm
        model: meta-llama/Llama-3.2-3B-Instruct
        baseUrl: http://localhost:8000/v1
        gpuDevice: 0

    - id: bob
      name: Bob
      model:
        provider: vllm
        model: meta-llama/Llama-3.2-3B-Instruct
        baseUrl: http://localhost:8001/v1
        gpuDevice: 1
```

### Placement Strategies

- **`round-robin`**: Distribute models evenly across GPUs
- **`memory-aware`**: Place models on GPUs with most available memory
- **`manual`**: Use explicit `gpuDevice` assignments

### Fallback Behavior

- **`queue`**: Queue requests when VRAM is full (recommended)
- **`cpu`**: Fall back to CPU inference (slow)
- **`error`**: Fail with error when VRAM is constrained

## Running

### One-Command Start (Docker Compose)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama
    ports:
      - '11434:11434'
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  airi:
    build: .
    ports:
      - '3000:3000'
    depends_on:
      - ollama
    environment:
      - OLLAMA_HOST=ollama:11434

volumes:
  ollama_data:
```

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f airi
```

### Manual Start

```bash
# Terminal 1: Start Ollama
OLLAMA_HOST=0.0.0.0 ollama serve

# Terminal 2: Pull models (first time)
ollama pull llama3.2:latest

# Terminal 3: Start AIRI
cd airi
pnpm dev
```

## Monitoring

### GPU Monitoring

```bash
# Real-time GPU monitoring
watch -n 1 nvidia-smi

# Detailed GPU metrics
nvidia-smi dmon -s pucvmet

# Memory usage per process
nvidia-smi --query-compute-apps=pid,used_memory --format=csv
```

### System Resources

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs -y

# Monitor CPU and memory
htop

# Monitor I/O
iotop

# Monitor network
nethogs
```

## Troubleshooting

### Out of VRAM

```bash
# Check VRAM usage
nvidia-smi

# Kill hung processes
sudo fuser -v /dev/nvidia*

# Clear CUDA cache (Python)
python -c "import torch; torch.cuda.empty_cache()"
```

### Models Not Loading

```bash
# Check Ollama logs
journalctl -u ollama -f

# Verify model is downloaded
ollama list

# Re-pull model
ollama pull llama3.2:latest --insecure
```

### Performance Issues

1. **Reduce context length**: Lower `maxTokens` in agent config
2. **Use smaller models**: Try `llama3.2:1b` instead of `llama3.2:latest`
3. **Enable KV cache**: Ensure your inference server has KV caching enabled
4. **Quantization**: Use quantized models (Q4_K_M) for lower VRAM usage

## Next Steps

- [GPU Configuration Details](/docs/en/docs/multi-agent/gpu-config)
- [API Reference](/docs/en/docs/multi-agent/api-reference)
- [Demo Scenarios](/docs/en/docs/multi-agent/demos)
