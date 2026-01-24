#!/usr/bin/env python3
"""
가상 아바타 오버레이 시작 스크립트
"""
import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """필요한 패키지 설치"""
    print("📦 필요한 패키지 설치 중...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], 
                      check=True, cwd=Path(__file__).parent)
        print("✅ 패키지 설치 완료!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 패키지 설치 실패: {e}")
        return False

def check_images():
    """아바타 이미지 확인"""
    images_dir = Path(__file__).parent / "images"
    required_images = [
        "ass_normal.png", "ass_happy.png", "ass_sad.png", 
        "ass_surprised.png", "ass_thinking.png", "ass_angry.png"
    ]
    
    missing_images = []
    for img in required_images:
        if not (images_dir / img).exists():
            missing_images.append(img)
    
    if missing_images:
        print("❌ 누락된 아바타 이미지:")
        for img in missing_images:
            print(f"   - {img}")
        print("\n💡 해결 방법:")
        print("   1. apps/desktop/src/renderer/images/face/ 폴더에서 이미지들을 복사")
        print("   2. avatar-overlay/images/ 폴더에 붙여넣기")
        return False
    
    print("✅ 모든 아바타 이미지 확인 완료!")
    return True

def main():
    """메인 함수"""
    print("🎭 가상 아바타 오버레이 시작...")
    
    # 1. 패키지 설치
    if not install_requirements():
        return
    
    # 2. 이미지 확인
    if not check_images():
        print("\n⚠️  이미지를 먼저 준비한 후 다시 실행해주세요.")
        return
    
    # 3. 메인 프로그램 실행
    print("\n🚀 아바타 오버레이 시작...")
    try:
        subprocess.run([sys.executable, "main.py"], cwd=Path(__file__).parent)
    except KeyboardInterrupt:
        print("\n👋 아바타 오버레이 종료")
    except Exception as e:
        print(f"❌ 실행 오류: {e}")

if __name__ == "__main__":
    main()
