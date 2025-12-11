import numpy as np
from PIL import Image
from hashlib import sha256
import random

def key_to_seed(gpg_key: str) -> int:
    """Convert GPG private key (string/hex) into deterministic seed."""
    return int(sha256(gpg_key.encode()).hexdigest(), 16) % (2**32)

def embed_signature(img: Image.Image, gpg_key: str, alpha: float = 0.05, block_min: int = 200, block_max: int = 300):
    """
    Embed a unique pixel pattern (watermark) into the center of an image.
    
    Args:
        img: PIL Image (RGB)
        gpg_key: User's private GPG key (used to derive unique pattern)
        alpha: Embedding strength (0.05–0.1 recommended, < 0.06 for minimal tampering)
        block_min, block_max: Range for random block size
    
    Returns:
        signed_img: np.ndarray (H, W, 3) — modified image
        meta: dict containing (block_size, seed, center coords)
    """
    seed = key_to_seed(gpg_key)
    np.random.seed(seed)

    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape

    block = random.randint(block_min, block_max)
    bx, by = (w - block) // 2, (h - block) // 2

    # Generate random pattern based on user's key
    # This pattern determines pixel position and orientation
    pattern = np.random.randn(block, block, 3)

    # Embed pattern in center region
    arr[by:by+block, bx:bx+block, :] += alpha * pattern * 255
    arr = np.clip(arr, 0, 255).astype(np.uint8)

    meta = {"seed": seed, "block_size": block, "center": (bx, by)}
    return arr, meta


def verify_signature(img: Image.Image, gpg_key: str, alpha: float = 0.05, block: int = 250):
    """
    Reconstruct the expected pattern area from an image and user's key.
    Returns the cropped patch the model should check authenticity for.
    
    Args:
        img: PIL Image
        gpg_key: private key (same as used in embedding)
        alpha: same embedding alpha used
        block: size of the patch (should roughly match training)
    
    Returns:
        patch: np.ndarray - normalized patch extracted from center
    """
    seed = key_to_seed(gpg_key)
    np.random.seed(seed)

    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape
    bx, by = (w - block) // 2, (h - block) // 2

    # Extract region and normalize
    region = arr[by:by+block, bx:bx+block, :]
    return np.clip(region / 255.0, 0, 1)



