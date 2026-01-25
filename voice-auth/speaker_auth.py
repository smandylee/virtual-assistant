"""
화자 인식 모듈 (Resemblyzer 기반)
- 화자 등록 (enroll): 사용자 목소리 샘플로 음성 지문 생성
- 화자 검증 (verify): 입력 음성이 등록된 사용자인지 확인
"""

import sys
import json
import os
import numpy as np
from pathlib import Path

# Resemblyzer 임포트
try:
    from resemblyzer import VoiceEncoder, preprocess_wav
    from resemblyzer.audio import sampling_rate
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Resemblyzer가 설치되지 않았습니다. pip install resemblyzer 를 실행하세요."
    }))
    sys.exit(1)

# 설정
VOICEPRINTS_DIR = Path(__file__).parent / "voiceprints"
SIMILARITY_THRESHOLD = 0.75  # 유사도 임계값 (0.75 이상이면 동일인으로 판단)

# 음성 인코더 (전역으로 한 번만 로드)
encoder = None

def get_encoder():
    """음성 인코더 로드 (지연 로딩)"""
    global encoder
    if encoder is None:
        encoder = VoiceEncoder()
    return encoder

def enroll_speaker(audio_paths: list, speaker_id: str = "owner") -> dict:
    """
    화자 등록: 여러 음성 샘플로 음성 지문 생성
    
    Args:
        audio_paths: 음성 파일 경로 리스트 (최소 3개 권장)
        speaker_id: 화자 식별자
    
    Returns:
        성공/실패 결과
    """
    try:
        enc = get_encoder()
        embeddings = []
        
        for audio_path in audio_paths:
            if not os.path.exists(audio_path):
                return {
                    "success": False,
                    "error": f"파일을 찾을 수 없습니다: {audio_path}"
                }
            
            # 음성 전처리 및 임베딩 생성
            wav = preprocess_wav(audio_path)
            if len(wav) < sampling_rate:  # 최소 1초
                return {
                    "success": False,
                    "error": f"음성이 너무 짧습니다 (최소 1초): {audio_path}"
                }
            
            embedding = enc.embed_utterance(wav)
            embeddings.append(embedding)
        
        # 평균 임베딩 계산 (음성 지문)
        voiceprint = np.mean(embeddings, axis=0)
        
        # 저장
        VOICEPRINTS_DIR.mkdir(parents=True, exist_ok=True)
        voiceprint_path = VOICEPRINTS_DIR / f"{speaker_id}.npy"
        np.save(voiceprint_path, voiceprint)
        
        return {
            "success": True,
            "speaker_id": speaker_id,
            "samples_used": len(audio_paths),
            "voiceprint_path": str(voiceprint_path),
            "message": f"화자 '{speaker_id}'의 음성 지문이 등록되었습니다."
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def verify_speaker(audio_path: str, speaker_id: str = "owner") -> dict:
    """
    화자 검증: 입력 음성이 등록된 화자인지 확인
    
    Args:
        audio_path: 검증할 음성 파일 경로
        speaker_id: 확인할 화자 식별자
    
    Returns:
        검증 결과 (일치 여부, 유사도 점수)
    """
    try:
        voiceprint_path = VOICEPRINTS_DIR / f"{speaker_id}.npy"
        
        if not voiceprint_path.exists():
            return {
                "success": False,
                "verified": False,
                "error": f"등록된 화자가 없습니다: {speaker_id}",
                "needs_enrollment": True
            }
        
        if not os.path.exists(audio_path):
            return {
                "success": False,
                "verified": False,
                "error": f"파일을 찾을 수 없습니다: {audio_path}"
            }
        
        # 저장된 음성 지문 로드
        stored_voiceprint = np.load(voiceprint_path)
        
        # 입력 음성 처리
        enc = get_encoder()
        wav = preprocess_wav(audio_path)
        
        if len(wav) < sampling_rate * 0.5:  # 최소 0.5초
            return {
                "success": False,
                "verified": False,
                "error": "음성이 너무 짧습니다 (최소 0.5초)"
            }
        
        # 임베딩 생성
        input_embedding = enc.embed_utterance(wav)
        
        # 코사인 유사도 계산
        similarity = np.dot(stored_voiceprint, input_embedding) / (
            np.linalg.norm(stored_voiceprint) * np.linalg.norm(input_embedding)
        )
        
        verified = float(similarity) >= SIMILARITY_THRESHOLD
        
        return {
            "success": True,
            "verified": verified,
            "similarity": float(similarity),
            "threshold": SIMILARITY_THRESHOLD,
            "speaker_id": speaker_id,
            "message": "본인 확인됨" if verified else "본인이 아닙니다"
        }
        
    except Exception as e:
        return {
            "success": False,
            "verified": False,
            "error": str(e)
        }

def check_enrollment(speaker_id: str = "owner") -> dict:
    """등록 상태 확인"""
    voiceprint_path = VOICEPRINTS_DIR / f"{speaker_id}.npy"
    enrolled = voiceprint_path.exists()
    
    return {
        "success": True,
        "enrolled": enrolled,
        "speaker_id": speaker_id,
        "voiceprint_path": str(voiceprint_path) if enrolled else None
    }

def delete_enrollment(speaker_id: str = "owner") -> dict:
    """등록 삭제"""
    voiceprint_path = VOICEPRINTS_DIR / f"{speaker_id}.npy"
    
    if voiceprint_path.exists():
        os.remove(voiceprint_path)
        return {
            "success": True,
            "message": f"화자 '{speaker_id}'의 음성 지문이 삭제되었습니다."
        }
    else:
        return {
            "success": False,
            "error": f"등록된 화자가 없습니다: {speaker_id}"
        }

def main():
    """CLI 인터페이스"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "사용법: python speaker_auth.py <command> [args]",
            "commands": ["enroll", "verify", "check", "delete"]
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "enroll":
        # python speaker_auth.py enroll <audio1> <audio2> ... [--speaker-id=xxx]
        audio_paths = []
        speaker_id = "owner"
        
        for arg in sys.argv[2:]:
            if arg.startswith("--speaker-id="):
                speaker_id = arg.split("=")[1]
            else:
                audio_paths.append(arg)
        
        if not audio_paths:
            print(json.dumps({
                "success": False,
                "error": "음성 파일 경로를 지정하세요 (최소 1개, 권장 3개 이상)"
            }))
            sys.exit(1)
        
        result = enroll_speaker(audio_paths, speaker_id)
        print(json.dumps(result, ensure_ascii=False))
        
    elif command == "verify":
        # python speaker_auth.py verify <audio_path> [--speaker-id=xxx]
        audio_path = None
        speaker_id = "owner"
        
        for arg in sys.argv[2:]:
            if arg.startswith("--speaker-id="):
                speaker_id = arg.split("=")[1]
            else:
                audio_path = arg
        
        if not audio_path:
            print(json.dumps({
                "success": False,
                "error": "음성 파일 경로를 지정하세요"
            }))
            sys.exit(1)
        
        result = verify_speaker(audio_path, speaker_id)
        print(json.dumps(result, ensure_ascii=False))
        
    elif command == "check":
        # python speaker_auth.py check [--speaker-id=xxx]
        speaker_id = "owner"
        for arg in sys.argv[2:]:
            if arg.startswith("--speaker-id="):
                speaker_id = arg.split("=")[1]
        
        result = check_enrollment(speaker_id)
        print(json.dumps(result, ensure_ascii=False))
        
    elif command == "delete":
        # python speaker_auth.py delete [--speaker-id=xxx]
        speaker_id = "owner"
        for arg in sys.argv[2:]:
            if arg.startswith("--speaker-id="):
                speaker_id = arg.split("=")[1]
        
        result = delete_enrollment(speaker_id)
        print(json.dumps(result, ensure_ascii=False))
        
    else:
        print(json.dumps({
            "success": False,
            "error": f"알 수 없는 명령: {command}",
            "commands": ["enroll", "verify", "check", "delete"]
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
