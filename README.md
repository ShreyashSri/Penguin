# Penguin: Proof-of-Art (cDNA)

> A robust, end-to-end framework for authenticated digital art generation and provenance, leveraging Ethereum Sepolia and IPFS.

**Penguin** establishes a secure lineage for AI-generated content by combining cryptographic signing, steganographic watermarking, and blockchain-based immutable storage. It provides a complete "cDNA" (creative DNA) for digital assets, ensuring transparency and authenticity from creation to certification.

## 🚀 Key Features

- **Authenticated Generation**: Deterministic AI art generation with embedded cryptographic proofs.
- **Steganographic Watermarking**: Unique, imperceptible noise patterns embedding creator identity.
- **Immutable Provenance**: On-chain manifest storage on Ethereum Sepolia for tamper-proof history.
- **Decentralized Storage**: Assets stored on IPFS via Pinata for reliable, distributed access.
- **Browser Extension**: Seamlessly capture and certify prompts directly from web interfaces.
- **Public Verification**: Open tools for verifying asset authenticity and lineage without requiring registration.

## 🛠 Technology Stack

- **Backend**: Go (Echo Framework)
- **Frontend**: React, Vite, Tailwind CSS
- **Smart Contracts**: Solidity, Hardhat, Ethereum Sepolia
- **Storage**: Pinata (IPFS)
- **Machine Learning**: TorchServe (PyTorch)
- **Cryptography**: Ed25519, BLAKE3, SHA-256

## 📋 Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Go 1.22+**
- **Node.js 20+** (with npm or pnpm)
- **Air**: For backend hot-reloading (`go install github.com/air-verse/air@latest`)
- **External Accounts**:
  - [Pinata](https://pinata.cloud) (for IPFS storage)
  - [Infura](https://infura.io) (for Ethereum RPC)
  - [Sepolia Faucet](https://sepoliafaucet.com/) (for testnet ETH)

## 📦 Installation & Setup

### 1. Repository Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/penguin.git
cd penguin

# Install root dependencies (Hardhat)
npm install
```

### 2. Smart Contract Deployment (Sepolia)

Create a `.env` file at the root to configure your blockchain credentials:

```env
INFURA_PROJECT_ID=your_infura_id
PRIVATE_KEY=0x_your_wallet_private_key
```

Deploy the contract:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

> **Note**: This will generate `api/internal/eth/abi.json` and `api/internal/eth/contract_address.txt`. Copy the contract address for the backend configuration.

### 3. Backend Service

Navigate to the API directory and configure the environment:

```bash
cd api
go mod tidy
cp .env.example .env
```

Edit `api/.env` with your specific keys:

```env
# Ethereum
INFURA_PROJECT_ID=your_infura_id
RPC_URL=https://sepolia.infura.io/v3/your_infura_id
PRIVATE_KEY=0x_your_private_key
CONTRACT_ADDRESS=0x_deployed_contract_address

# IPFS (Pinata)
PINATA_API_KEY=your_pinata_key
PINATA_API_SECRET=your_pinata_secret
```

Start the backend server:

```bash
# Using Air (Recommended for dev)
air

# OR using Go directly
go run ./cmd/server
```

The server runs on `http://localhost:8787` and launches TorchServe on `http://127.0.0.1:8080`.

### 4. Frontend Application

```bash
cd frontend
npm install

# Optional: Configure API URL
export VITE_API_URL="http://localhost:8787"

npm run dev
```

Access the dashboard at `http://localhost:5173`.

### 5. Chrome Extension

```bash
cd extension
npm install
npm run build
```

Load the `dist/` directory as an unpacked extension in Chrome/Chromium (`chrome://extensions`).

## 📡 API Overview

### Manifests & Provenance
- `POST /upload`: Upload authentication manifest to IPFS and Ethereum.
- `GET /verify?key=/ipfs/<cid>`: verify an asset's signature and provenance.

### Core Workflows
- `POST /generate`: Create new certified AI artwork.
- `POST /certificate/:id`: Retrieve proof certificate.
- `POST /model/predict`: Run authenticity checks against the local model.

### Extension
- `POST /ext/push`: Receive prompt data captured by the browser extension.

## 🗺 Roadmap

- [x] Pinata IPFS & Ethereum Sepolia integration
- [x] Watermarking & Certificate generation
- [ ] Session graph UI visualization
- [ ] Perceptual hashing (pHash)
- [ ] Multi-chain support (Polygon, Base)

---

**License**: MIT
