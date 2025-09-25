import cv2

cap = cv2.VideoCapture(0)  # ajusta a /dev/video0 si es necesario
while True:
    ret, frame = cap.read()
    if not ret:
        break
    cv2.imshow("Camara DroidCam", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
