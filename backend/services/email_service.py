import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Dict, Any

logger = logging.getLogger("email_service")


def send_welcome_email(
    to_email: str,
    full_name: str,
    username: str,
    password: str,
    role_name: Optional[str] = None,
    agent_name: Optional[str] = None,
    location_details: Optional[Dict[str, Any]] = None,
    login_url: Optional[str] = "http://localhost:5173"
) -> bool:
    """
    Send a professional HTML onboarding email to a newly created user via AWS SES SMTP.
    Returns True on success, False on error (never raises exception to prevent blocking user creation).
    """
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    from_name = os.getenv("SMTP_FROM_NAME", "EPIC Command")
    from_email = os.getenv("SMTP_FROM_EMAIL", "no-reply@epic-command.com")

    if not all([smtp_host, smtp_user, smtp_pass, from_email]):
        logger.warning("SMTP configuration is incomplete. Skipping email delivery.")
        return False

    subject = f"Welcome to {from_name} - Surveillance Console Access"

    location_str = "Global Scope"
    if location_details:
        parts = [v for k, v in [
            ("Site", location_details.get("site")),
            ("Area", location_details.get("area")),
            ("City", location_details.get("city")),
            ("Province", location_details.get("province"))
        ] if v]
        if parts:
            location_str = " > ".join(parts)

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .email-container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 28px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }}
    .header p {{ margin: 6px 0 0; font-size: 13px; opacity: 0.9; }}
    .content {{ padding: 32px 28px; }}
    .greeting {{ font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }}
    .intro {{ font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }}
    .creds-card {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px; }}
    .cred-row {{ display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #dcfce7; }}
    .cred-row:last-child {{ border-bottom: none; }}
    .cred-label {{ color: #166534; font-weight: 600; width: 140px; }}
    .cred-value {{ color: #0f172a; font-family: monospace; font-size: 14px; font-weight: 700; }}
    .btn-container {{ text-align: center; margin: 28px 0; }}
    .btn {{ display: inline-block; background-color: #059669; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 2px 6px rgba(5,150,105,0.3); }}
    .footer {{ background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>EPIC COMMAND</h1>
      <p>Smart Surveillance & Dynamic Role Access Console</p>
    </div>
    <div class="content">
      <div class="greeting">Hello {full_name},</div>
      <p class="intro">
        Your user account has been successfully provisioned on the <strong>{from_name}</strong> surveillance network. Below are your account credentials and system assignment details:
      </p>

      <div class="creds-card">
        <div class="cred-row">
          <span class="cred-label">Login Email:</span>
          <span class="cred-value">{to_email}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Initial Password:</span>
          <span class="cred-value">{password}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Assigned Role:</span>
          <span class="cred-value" style="font-family: inherit;">{role_name or 'Standard User'}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Assigned Agent:</span>
          <span class="cred-value" style="font-family: inherit;">{agent_name or 'Unassigned'}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Location Scope:</span>
          <span class="cred-value" style="font-family: inherit;">{location_str}</span>
        </div>
      </div>

      <div class="btn-container">
        <a href="{login_url}" class="btn">Log In to Surveillance Center</a>
      </div>

      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
        <strong>Security Notice:</strong> Please sign in using your email and initial password. For enhanced security, we recommend updating your password upon your first sign in.
      </p>
    </div>
    <div class="footer">
      This is an automated notification from {from_name}.<br>
      If you did not expect this invitation, please contact your surveillance system administrator.
    </div>
  </div>
</body>
</html>"""

    plain_content = f"""Welcome to {from_name} - Surveillance Console

Hello {full_name},

Your user account has been successfully provisioned on {from_name}.

Login Email: {to_email}
Password: {password}
Assigned Role: {role_name or 'Standard User'}
Assigned Agent: {agent_name or 'Unassigned'}
Location Scope: {location_str}

Login URL: {login_url}

Security Notice: Please update your password after your initial sign in.
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(plain_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_email, [to_email], msg.as_string())
        server.close()
        logger.info(f"Welcome email successfully dispatched to {to_email}")
        return True
    except Exception as err:
        logger.warning(f"Failed to dispatch email to {to_email} via AWS SES: {err}")
        return False
