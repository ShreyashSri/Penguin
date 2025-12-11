#!/usr/bin/env python3
"""
Test script for TorchServe model deployment.
Tests both direct TorchServe endpoint and Go API proxy endpoint.
"""

import requests
import sys
import time
import json
from PIL import Image
import io
from pathlib import Path

# Configuration
TORCHSERVE_BASE = "http://127.0.0.1:8080"
GO_API_BASE = "http://localhost:8787"
MODEL_NAME = "poar_detector"

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"


def print_header(text):
    print(f"\n{BOLD}{BLUE}{'='*60}{RESET}")
    print(f"{BOLD}{BLUE}{text}{RESET}")
    print(f"{BOLD}{BLUE}{'='*60}{RESET}\n")


def print_test(name):
    print(f"{BOLD}▶ {name}...{RESET}", end=" ", flush=True)


def print_success(msg=""):
    print(f"{GREEN}✓{RESET} {msg}")


def print_error(msg=""):
    print(f"{RED}✗{RESET} {msg}")


def print_warning(msg=""):
    print(f"{YELLOW}⚠{RESET} {msg}")


def print_info(msg):
    print(f"{BLUE}ℹ{RESET} {msg}")


def create_test_image(size=(224, 224), color=(100, 150, 200)):
    """Create a simple test image."""
    img = Image.new("RGB", size, color)
    return img


def image_to_bytes(img, format="PNG"):
    """Convert PIL Image to bytes."""
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_torchserve_ping():
    """Test TorchServe ping endpoint."""
    print_test("Testing TorchServe ping endpoint")
    try:
        response = requests.get(f"{TORCHSERVE_BASE}/ping", timeout=5)
        if response.status_code == 200:
            print_success("TorchServe is responding")
            return True
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to TorchServe. Is it running?")
        print_info("Start it with: bash scripts/start_model_server.sh")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False


def test_torchserve_models():
    """Test TorchServe models endpoint."""
    print_test("Testing TorchServe models endpoint")
    try:
        response = requests.get(f"{TORCHSERVE_BASE.replace(':8080', ':8081')}/models", timeout=5)
        if response.status_code == 200:
            models = response.json()
            print_success(f"Found {len(models.get('models', []))} model(s)")
            for model in models.get("models", []):
                print_info(f"  - Model: {model.get('modelName', 'unknown')}")
            return True
        else:
            print_warning(f"Status code: {response.status_code}")
            return False
    except Exception as e:
        print_warning(f"Could not list models: {e}")
        return False


def test_direct_torchserve_prediction():
    """Test direct TorchServe prediction endpoint."""
    print_test("Testing direct TorchServe prediction endpoint")
    
    # Create test image
    test_img = create_test_image()
    img_bytes = image_to_bytes(test_img, format="PNG")
    
    try:
        url = f"{TORCHSERVE_BASE}/predictions/{MODEL_NAME}"
        response = requests.post(
            url,
            data=img_bytes,
            headers={"Content-Type": "image/png"},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print_success("Prediction successful")
            print_info(f"  Authenticity Score: {result.get('authenticity_score', 'N/A')}")
            print_info(f"  Threshold: {result.get('threshold', 'N/A')}")
            print_info(f"  Status: {result.get('status', 'N/A')}")
            return True, result
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text[:200]}")
            return False, None
    except Exception as e:
        print_error(f"Error: {e}")
        return False, None


def test_go_api_prediction():
    """Test Go API proxy prediction endpoint."""
    print_test("Testing Go API proxy prediction endpoint")
    
    # Create test image
    test_img = create_test_image()
    img_bytes = image_to_bytes(test_img, format="PNG")
    
    try:
        url = f"{GO_API_BASE}/model/predict"
        response = requests.post(
            url,
            data=img_bytes,
            headers={"Content-Type": "image/png"},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print_success("Prediction successful via Go API")
            print_info(f"  Authenticity Score: {result.get('authenticity_score', 'N/A')}")
            print_info(f"  Threshold: {result.get('threshold', 'N/A')}")
            print_info(f"  Status: {result.get('status', 'N/A')}")
            return True, result
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text[:200]}")
            return False, None
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to Go API. Is it running?")
        print_info("Start it with: cd api && air")
        return False, None
    except Exception as e:
        print_error(f"Error: {e}")
        return False, None


def test_with_image_file(image_path):
    """Test prediction with a real image file."""
    print_test(f"Testing prediction with image file: {image_path}")
    
    try:
        img = Image.open(image_path)
        img_bytes = image_to_bytes(img, format=img.format or "PNG")
        
        # Test direct TorchServe
        url = f"{TORCHSERVE_BASE}/predictions/{MODEL_NAME}"
        response = requests.post(
            url,
            data=img_bytes,
            headers={"Content-Type": f"image/{img.format.lower() if img.format else 'png'}"},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print_success("Prediction successful")
            print_info(f"  Authenticity Score: {result.get('authenticity_score', 'N/A')}")
            print_info(f"  Threshold: {result.get('threshold', 'N/A')}")
            print_info(f"  Status: {result.get('status', 'N/A')}")
            return True, result
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text[:200]}")
            return False, None
    except FileNotFoundError:
        print_error(f"Image file not found: {image_path}")
        return False, None
    except Exception as e:
        print_error(f"Error: {e}")
        return False, None


def test_multiple_formats():
    """Test prediction with different image formats."""
    print_test("Testing different image formats")
    
    formats = ["PNG", "JPEG"]
    results = {}
    
    for fmt in formats:
        test_img = create_test_image()
        img_bytes = image_to_bytes(test_img, format=fmt)
        
        try:
            url = f"{TORCHSERVE_BASE}/predictions/{MODEL_NAME}"
            content_type = f"image/{fmt.lower()}"
            response = requests.post(
                url,
                data=img_bytes,
                headers={"Content-Type": content_type},
                timeout=30
            )
            
            if response.status_code == 200:
                results[fmt] = response.json()
                print_success(f"{fmt}: OK")
            else:
                print_error(f"{fmt}: Failed (status {response.status_code})")
        except Exception as e:
            print_error(f"{fmt}: Error - {e}")
    
    return len(results) > 0


def main():
    print_header("TorchServe Model Deployment Test")
    
    print_info(f"TorchServe URL: {TORCHSERVE_BASE}")
    print_info(f"Go API URL: {GO_API_BASE}")
    print_info(f"Model Name: {MODEL_NAME}")
    print()
    
    results = {
        "torchserve_ping": False,
        "torchserve_models": False,
        "direct_prediction": False,
        "go_api_prediction": False,
        "multiple_formats": False,
    }
    
    # Test 1: TorchServe ping
    results["torchserve_ping"] = test_torchserve_ping()
    if not results["torchserve_ping"]:
        print_warning("TorchServe is not running. Please start it first.")
        print_info("Run: bash scripts/start_model_server.sh")
        sys.exit(1)
    
    time.sleep(1)
    
    # Test 2: List models
    results["torchserve_models"] = test_torchserve_models()
    time.sleep(1)
    
    # Test 3: Direct TorchServe prediction
    success, result = test_direct_torchserve_prediction()
    results["direct_prediction"] = success
    time.sleep(1)
    
    # Test 4: Go API proxy prediction
    success, result = test_go_api_prediction()
    results["go_api_prediction"] = success
    time.sleep(1)
    
    # Test 5: Multiple formats
    results["multiple_formats"] = test_multiple_formats()
    
    # Test 6: If image file provided as argument
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print_header("Testing with provided image file")
        test_with_image_file(image_path)
    
    # Summary
    print_header("Test Summary")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for test_name, passed_test in results.items():
        status = f"{GREEN}✓ PASSED{RESET}" if passed_test else f"{RED}✗ FAILED{RESET}"
        print(f"  {test_name.replace('_', ' ').title()}: {status}")
    
    print()
    print(f"{BOLD}Total: {passed}/{total} tests passed{RESET}")
    
    if passed == total:
        print_success("All tests passed! 🎉")
        sys.exit(0)
    else:
        print_warning(f"{total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

