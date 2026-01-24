#!/usr/bin/env python3
"""
OpenCV 기반 가상 아바타 오버레이
"""
import cv2
import numpy as np
import json
import os
import sys
from pathlib import Path
import threading
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

class AvatarOverlay:
    def __init__(self):
        self.window_name = "Virtual Avatar"
        self.avatar_size = (208, 304)  # 아바타 크기
        self.position = (100, 100)     # 초기 위치
        self.current_expression = "normal"
        self.is_visible = True
        self.is_talking = False
        
        # 이미지 경로 설정
        self.base_path = Path(__file__).parent
        self.images_path = self.base_path / "images"
        
        # 아바타 이미지들 로드
        self.avatar_images = self.load_avatar_images()
        
        # OpenCV 창 설정
        self.setup_window()
        
    def load_avatar_images(self):
        """아바타 이미지들을 로드"""
        images = {}
        expressions = ['normal', 'happy', 'sad', 'surprised', 'thinking', 'angry']
        
        for expr in expressions:
            img_path = self.images_path / f"ass_{expr}.png"
            if img_path.exists():
                # PNG 투명도 지원으로 로드
                img = cv2.imread(str(img_path), cv2.IMREAD_UNCHANGED)
                if img is not None:
                    # 크기 조정
                    img = cv2.resize(img, self.avatar_size)
                    images[expr] = img
                    print(f"✅ 로드됨: {expr}")
                else:
                    print(f"❌ 로드 실패: {expr}")
            else:
                print(f"❌ 파일 없음: {img_path}")
        
        return images
    
    def setup_window(self):
        """투명 오버레이 창 설정"""
        # 창 생성 (투명 배경)
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        
        # 창 크기 설정
        cv2.resizeWindow(self.window_name, self.avatar_size[0], self.avatar_size[1])
        
        # 마우스 콜백 설정
        cv2.setMouseCallback(self.window_name, self.mouse_callback)
        
        # 창을 화면 우하단에 위치
        cv2.moveWindow(self.window_name, 100, 100)
        
        # 창을 항상 위에 표시하되, 클릭은 통과시키기
        cv2.setWindowProperty(self.window_name, cv2.WND_PROP_TOPMOST, 1)
        
        # Windows에서 투명도 설정
        try:
            import win32gui
            import win32con
            hwnd = win32gui.FindWindow(None, self.window_name)
            if hwnd:
                # WS_EX_LAYERED 스타일 추가
                win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, 
                    win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE) | win32con.WS_EX_LAYERED)
                # 투명도 설정 (0-255, 255는 완전 불투명)
                win32gui.SetLayeredWindowAttributes(hwnd, 0, 255, win32con.LWA_ALPHA)
        except ImportError:
            print("⚠️ win32gui 모듈이 없습니다. pip install pywin32")
        except Exception as e:
            print(f"⚠️ 투명도 설정 실패: {e}")
        
    def mouse_callback(self, event, x, y, flags, param):
        """마우스 드래그 처리"""
        if event == cv2.EVENT_LBUTTONDOWN:
            self.drag_start = (x, y)
            self.is_dragging = True
        elif event == cv2.EVENT_MOUSEMOVE and hasattr(self, 'is_dragging') and self.is_dragging:
            dx = x - self.drag_start[0]
            dy = y - self.drag_start[1]
            self.position = (
                max(0, min(self.position[0] + dx, 1920 - self.avatar_size[0])),
                max(0, min(self.position[1] + dy, 1080 - self.avatar_size[1]))
            )
            self.drag_start = (x, y)
        elif event == cv2.EVENT_LBUTTONUP:
            self.is_dragging = False
    
    def change_expression(self, expression):
        """아바타 표정 변경"""
        if expression in self.avatar_images:
            self.current_expression = expression
            print(f"😊 표정 변경: {expression}")
            return True
        return False
    
    def set_position(self, x, y):
        """아바타 위치 설정"""
        self.position = (x, y)
        cv2.moveWindow(self.window_name, x, y)
    
    def show_speech_bubble(self, text):
        """말풍선 표시"""
        # 말풍선은 별도 창으로 구현
        pass
    
    def render(self):
        """아바타 렌더링"""
        if not self.is_visible:
            return
        
        # 현재 표정 이미지 가져오기
        if self.current_expression in self.avatar_images:
            img = self.avatar_images[self.current_expression].copy()
        else:
            # 기본 이미지
            img = np.zeros((*self.avatar_size, 4), dtype=np.uint8)
        
        # 말하기 애니메이션
        if self.is_talking:
            # 약간의 스케일 변화
            scale = 1.0 + 0.05 * np.sin(time.time() * 10)
            h, w = img.shape[:2]
            new_h, new_w = int(h * scale), int(w * scale)
            img = cv2.resize(img, (new_w, new_h))
            
            # 중앙 정렬
            pad_h = (self.avatar_size[0] - new_h) // 2
            pad_w = (self.avatar_size[1] - new_w) // 2
            img = cv2.copyMakeBorder(img, pad_h, pad_h, pad_w, pad_w, 
                                   cv2.BORDER_CONSTANT, value=[0,0,0,0])
        
        # 창 위치 업데이트
        cv2.moveWindow(self.window_name, self.position[0], self.position[1])
        
        # 이미지 표시
        cv2.imshow(self.window_name, img)
    
    def start_talking(self):
        """말하기 시작"""
        self.is_talking = True
    
    def stop_talking(self):
        """말하기 중지"""
        self.is_talking = False
    
    def hide(self):
        """아바타 숨기기"""
        self.is_visible = False
        cv2.destroyWindow(self.window_name)
    
    def show(self):
        """아바타 보이기"""
        self.is_visible = True
        self.setup_window()

# Flask API 서버
app = Flask(__name__)
CORS(app)

# 전역 아바타 인스턴스
avatar = None

@app.route('/avatar/expression', methods=['POST'])
def change_expression():
    """표정 변경 API"""
    global avatar
    data = request.get_json()
    expression = data.get('expression', 'normal')
    
    if avatar and avatar.change_expression(expression):
        return jsonify({"status": "success", "expression": expression})
    else:
        return jsonify({"status": "error", "message": "표정 변경 실패"}), 400

@app.route('/avatar/position', methods=['POST'])
def set_position():
    """위치 설정 API"""
    global avatar
    data = request.get_json()
    x = data.get('x', 100)
    y = data.get('y', 100)
    
    if avatar:
        avatar.set_position(x, y)
        return jsonify({"status": "success", "position": [x, y]})
    else:
        return jsonify({"status": "error", "message": "아바타 초기화 필요"}), 400

@app.route('/avatar/talk', methods=['POST'])
def start_talking():
    """말하기 시작 API"""
    global avatar
    if avatar:
        avatar.start_talking()
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "아바타 초기화 필요"}), 400

@app.route('/avatar/stop', methods=['POST'])
def stop_talking():
    """말하기 중지 API"""
    global avatar
    if avatar:
        avatar.stop_talking()
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "아바타 초기화 필요"}), 400

@app.route('/avatar/status', methods=['GET'])
def get_status():
    """아바타 상태 조회 API"""
    global avatar
    if avatar:
        return jsonify({
            "status": "success",
            "expression": avatar.current_expression,
            "position": avatar.position,
            "is_visible": avatar.is_visible,
            "is_talking": avatar.is_talking
        })
    else:
        return jsonify({"status": "error", "message": "아바타 초기화 필요"}), 400

def run_opencv_loop():
    """OpenCV 메인 루프"""
    global avatar
    while True:
        if avatar and avatar.is_visible:
            avatar.render()
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('h'):
            avatar.hide() if avatar else None
        elif key == ord('s'):
            avatar.show() if avatar else None

def main():
    """메인 함수"""
    global avatar
    
    print("🎭 가상 아바타 오버레이 시작...")
    
    # 아바타 초기화
    avatar = AvatarOverlay()
    
    # OpenCV 루프를 별도 스레드에서 실행
    opencv_thread = threading.Thread(target=run_opencv_loop, daemon=True)
    opencv_thread.start()
    
    # Flask 서버 시작
    print("🌐 API 서버 시작: http://localhost:5001")
    print("⌨️  키보드 단축키:")
    print("   q: 종료")
    print("   h: 숨기기")
    print("   s: 보이기")
    
    try:
        app.run(host='0.0.0.0', port=5001, debug=False)
    except KeyboardInterrupt:
        print("\n👋 아바타 오버레이 종료")
        if avatar:
            avatar.hide()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
