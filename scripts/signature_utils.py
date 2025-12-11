# signature_utils.py
import numpy as np, hashlib

def signature_pattern(key: str, block_size: int):
    """Deterministic normalized Gaussian noise for both embed & verify."""
    h = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    rng = np.random.default_rng(h)
    pat = rng.standard_normal((block_size, block_size)).astype(np.float32)
    pat = (pat - pat.mean()) / (pat.std() + 1e-6)
    return pat
