#!/usr/bin/env python3
"""
Script to embed signature, compress image, and verify through model.
Called from Go backend to process uploaded images.
"""

import sys
import os
import json
import argparse
from pathlib import Path
from PIL import Image
import numpy as np
import io
import requests

# Add models directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'models'))
from scripts.embedder_fixed import embed_signature, verify_signature

# Default GPG key
DEFAULT_GPG_KEY = "user_key_40"
DEFAULT_ALPHA = 0.05  # Keep alpha < 0.06 for minimal tampering
DEFAULT_BLOCK = 250

def compress_to_target_size(img: Image.Image, target_size_bytes: int, format: str = 'JPEG', 
                           initial_quality: int = 95, tolerance: float = 0.05):
    """
    Compress image to match target file size using binary search on quality.
    
    Args:
        img: PIL Image to compress
        target_size_bytes: Target file size in bytes
        format: Output format ('JPEG' or 'PNG')
        initial_quality: Starting quality for JPEG
        tolerance: Acceptable size difference as fraction (0.05 = 5%)
    
    Returns:
        bytes: Compressed image data
    """
    if format != 'JPEG':
        # For PNG, use optimize=True
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG', optimize=True)
        return img_bytes.getvalue()
    
    # Binary search for JPEG quality
    low, high = 10, initial_quality
    best_bytes = None
    best_diff = float('inf')
    
    while low <= high:
        quality = (low + high) // 2
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG', quality=quality, optimize=True)
        size = len(img_bytes.getvalue())
        diff = abs(size - target_size_bytes)
        
        if diff < best_diff:
            best_diff = diff
            best_bytes = img_bytes.getvalue()
        
        if size < target_size_bytes * (1 - tolerance):
            low = quality + 1
        elif size > target_size_bytes * (1 + tolerance):
            high = quality - 1
        else:
            # Within tolerance, return immediately
            return img_bytes.getvalue()
    
    return best_bytes

def embed_compress_and_test(image_data: bytes, gpg_key: str = DEFAULT_GPG_KEY, 
                           alpha: float = DEFAULT_ALPHA, 
                           model_endpoint: str = "http://127.0.0.1:8080/predictions/poar_detector",
                           compress: bool = True):
    """
    Complete workflow: embed signature, compress, extract patch, test through model.
    
    Args:
        image_data: Original image bytes
        gpg_key: GPG key for signature (default: user_key_40)
        alpha: Embedding strength
        model_endpoint: Model API endpoint
        compress: Whether to compress to match original size
    
    Returns:
        dict: Results including embedding status, model prediction, and metadata
    """
    try:
        # Load original image
        original_img = Image.open(io.BytesIO(image_data)).convert("RGB")
        original_size = len(image_data)
        original_dimensions = original_img.size
        
        # Embed signature
        signed_arr, meta = embed_signature(original_img, gpg_key, alpha=alpha)
        signed_img = Image.fromarray(signed_arr)
        
        # Determine format
        format_hint = Image.open(io.BytesIO(image_data)).format or 'JPEG'
        output_format = 'JPEG' if format_hint in ['JPEG', 'JPEG2000'] else 'PNG'
        
        # Compress to match original size if requested
        if compress:
            compressed_data = compress_to_target_size(signed_img, original_size, format=output_format)
            compressed_size = len(compressed_data)
            # Reload compressed image for patch extraction
            signed_img = Image.open(io.BytesIO(compressed_data)).convert("RGB")
        else:
            img_bytes = io.BytesIO()
            signed_img.save(img_bytes, format=output_format, quality=95 if output_format == 'JPEG' else None)
            compressed_data = img_bytes.getvalue()
            compressed_size = len(compressed_data)
        
        # Extract signature patch
        patch = verify_signature(signed_img, gpg_key, alpha=alpha, block=DEFAULT_BLOCK)
        patch_img = Image.fromarray((patch * 255).astype(np.uint8))
        
        # Resize patch to model input size (224x224)
        patch_img_resized = patch_img.resize((224, 224), Image.Resampling.LANCZOS)
        
        # Convert patch to bytes for model
        patch_bytes = io.BytesIO()
        patch_img_resized.save(patch_bytes, format='PNG', optimize=True)
        patch_data = patch_bytes.getvalue()
        
        # Test through model
        model_result = None
        model_error = None
        try:
            # Try direct TorchServe endpoint first, fallback to Go API proxy
            endpoints = [
                model_endpoint,  # Direct TorchServe
                "http://localhost:8787/model/predict",  # Go API proxy
            ]
            
            for endpoint in endpoints:
                try:
                    response = requests.post(
                        endpoint,
                        data=patch_data,
                        headers={"Content-Type": "image/png"},
                        timeout=30
                    )
                    response.raise_for_status()
                    model_result = response.json()
                    break
                except Exception:
                    continue
            
            if not model_result:
                raise Exception("Could not connect to model endpoint")
                
        except Exception as e:
            model_error = str(e)
        
        # Calculate compression stats
        size_diff = ((compressed_size - original_size) / original_size) * 100 if original_size > 0 else 0
        
        return {
            "success": True,
            "embedding": {
                "gpg_key": gpg_key,
                "alpha": alpha,
                "block_size": meta["block_size"],
                "seed": meta["seed"],
                "center": meta["center"]
            },
            "compression": {
                "original_size": original_size,
                "compressed_size": compressed_size,
                "size_difference_percent": round(size_diff, 2),
                "original_dimensions": original_dimensions,
                "format": output_format
            },
            "model_prediction": model_result if model_result else None,
            "model_error": model_error,
            "compressed_image": compressed_data if not compress else None  # Only return if not compressing
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    parser = argparse.ArgumentParser(description='Embed signature, compress, and test through model')
    parser.add_argument('input', help='Input image file path')
    parser.add_argument('--key', default=DEFAULT_GPG_KEY, help='GPG key (default: user_key_40)')
    parser.add_argument('--alpha', type=float, default=DEFAULT_ALPHA, help='Embedding strength (default: 0.05)')
    parser.add_argument('--output', help='Output image file path (optional)')
    parser.add_argument('--model-endpoint', default='http://127.0.0.1:8080/predictions/poar_detector',
                       help='Model API endpoint')
    parser.add_argument('--no-compress', action='store_true', help='Skip compression')
    parser.add_argument('--json', action='store_true', help='Output JSON only')
    
    args = parser.parse_args()
    
    # Read input image
    with open(args.input, 'rb') as f:
        image_data = f.read()
    
    # Process
    result = embed_compress_and_test(
        image_data,
        gpg_key=args.key,
        alpha=args.alpha,
        model_endpoint=args.model_endpoint,
        compress=not args.no_compress
    )
    
    if not result["success"]:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)
    
    # Save compressed image if output specified
    if args.output and result.get("compressed_image"):
        with open(args.output, 'wb') as f:
            f.write(result["compressed_image"])
    
    # Output results
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("✅ Signature embedded successfully!")
        print(f"   GPG Key: {result['embedding']['gpg_key']}")
        print(f"   Alpha: {result['embedding']['alpha']}")
        print(f"   Block Size: {result['embedding']['block_size']}")
        print(f"\n📦 Compression:")
        print(f"   Original: {result['compression']['original_size']} bytes")
        print(f"   Compressed: {result['compression']['compressed_size']} bytes")
        print(f"   Difference: {result['compression']['size_difference_percent']:+.2f}%")
        
        if result.get("model_prediction"):
            pred = result["model_prediction"]
            print(f"\n🎨 Model Prediction:")
            print(f"   Authenticity Score: {pred.get('authenticity_score', 'N/A')}")
            print(f"   Threshold: {pred.get('threshold', 'N/A')}")
            print(f"   Status: {pred.get('status', 'N/A')}")
        elif result.get("model_error"):
            print(f"\n⚠️  Model Error: {result['model_error']}")

if __name__ == "__main__":
    main()

