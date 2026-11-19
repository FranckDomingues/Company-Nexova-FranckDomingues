"""Password-reset email (AUTH-03 / EXTRA-01): responsive HTML with a plain-text fallback."""

from html import escape

from app.mailer import EmailMessage


def password_reset_email(to: str, reset_url: str, expires_minutes: int) -> EmailMessage:
    link = escape(reset_url, quote=True)
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Restablece tu contraseña de Nexova</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;">Nexova <span style="color:#64748b;font-weight:normal;">Backoffice</span></td></tr>
<tr><td style="padding:8px 28px;font-size:16px;line-height:1.5;">
<h1 style="font-size:22px;margin:8px 0 12px;">Restablece tu contraseña</h1>
<p style="margin:0 0 16px;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Pulsa el botón para elegir una nueva.</p>
</td></tr>
<tr><td align="center" style="padding:8px 28px 20px;">
<a href="{link}" style="display:inline-block;background:#0369a1;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:8px;">Restablecer contraseña</a>
</td></tr>
<tr><td style="padding:0 28px 8px;font-size:14px;line-height:1.5;color:#334155;">
<p style="margin:0 0 8px;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
<p style="margin:0 0 16px;word-break:break-all;"><a href="{link}" style="color:#0369a1;">{link}</a></p>
<p style="margin:0 0 16px;">El enlace caduca en <strong>{expires_minutes} minutos</strong> y solo puede usarse una vez.</p>
<p style="margin:0 0 24px;color:#64748b;">Si no solicitaste este cambio, ignora este correo: tu contraseña no cambiará.</p>
</td></tr>
</table>
<p style="font-size:12px;color:#94a3b8;margin:16px 0 0;">Nexova Solutions · Mensaje automático, no respondas a este correo.</p>
</td></tr>
</table>
</body>
</html>"""
    text = (
        "Restablece tu contraseña de Nexova\n\n"
        "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.\n"
        f"Abre este enlace para elegir una nueva:\n\n{reset_url}\n\n"
        f"El enlace caduca en {expires_minutes} minutos y solo puede usarse una vez.\n"
        "Si no solicitaste este cambio, ignora este correo: tu contraseña no cambiará.\n"
    )
    return EmailMessage(to=to, subject="Restablece tu contraseña de Nexova", html=html, text=text)
