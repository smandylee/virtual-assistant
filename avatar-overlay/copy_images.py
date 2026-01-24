#!/usr/bin/env python3
"""
아바타 이미지를 복사하는 스크립트
"""
import shutil
from pathlib import Path

def copy_avatar_images():
    """아바타 이미지들을 복사"""
    # 소스 경로 (기존 Electron 이미지들)
    source_dir = Path(__file__).parent.parent / "apps" / "desktop" / "src" / "renderer" / "images" / "face"
    
    # 대상 경로 (OpenCV 이미지들)
    target_dir = Path(__file__).parent / "images"
    
    # 대상 디렉토리 생성
    target_dir.mkdir(exist_ok=True)
    
    # 복사할 이미지들
    images_to_copy = [
        "ass_plain.png",      # normal
        "ass_talking.png",    # happy  
        "ass_sad.png",       # sad
        "ass_surpirsed.png", # surprised
        "ass_tired.png",     # thinking
        "ass_angry.png"      # angry
    ]
    
    copied_count = 0
    missing_count = 0
    
    print("📁 아바타 이미지 복사 중...")
    
    for img_name in images_to_copy:
        source_path = source_dir / img_name
        target_path = target_dir / img_name
        
        if source_path.exists():
            shutil.copy2(source_path, target_path)
            print(f"✅ 복사됨: {img_name}")
            copied_count += 1
        else:
            print(f"❌ 없음: {img_name}")
            missing_count += 1
    
    print(f"\n📊 복사 결과:")
    print(f"   ✅ 성공: {copied_count}개")
    print(f"   ❌ 실패: {missing_count}개")
    
    if missing_count > 0:
        print(f"\n💡 누락된 이미지들을 {source_dir}에서 확인해주세요.")
        return False
    
    return True

if __name__ == "__main__":
    copy_avatar_images()
