# pip install qrcode[pil]

import qrcode

# link
link = input("Ingresa el link que quieres convertir en QR: ")

# Crear el QR
qr = qrcode.QRCode(
    version=1,  
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,  # tamaño de cada cuadro del QR
    border=4,     # grosor del borde
)
qr.add_data(link)
qr.make(fit=True)

# imagen
img = qr.make_image(fill_color="black", back_color="white")

# Guardar imagen
img.save("codigo_qr.png")
print("QR generado y guardado como codigo_qr.png")
