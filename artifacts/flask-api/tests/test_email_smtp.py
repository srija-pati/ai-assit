import base64
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import smtplib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as legal


TEST_APP_PASSWORD = "test-only-app-password"
SMTP_ENV = {
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USERNAME": "website@example.com",
    "SMTP_PASSWORD": TEST_APP_PASSWORD,
    "SMTP_FROM_EMAIL": "website@example.com",
    "SMTP_FROM_NAME": "AI Legal",
}


class EmailSmtpTests(unittest.TestCase):
    def setUp(self):
        self.user_ids = []

    def tearDown(self):
        if not self.user_ids:
            return
        with legal.app.app_context():
            for user_id in self.user_ids:
                legal.db.session.query(legal.SentEmail).filter_by(user_id=user_id).delete(
                    synchronize_session=False
                )
                legal.db.session.query(legal.AdminLog).filter_by(user_id=user_id).delete(
                    synchronize_session=False
                )
                legal.db.session.query(legal.User).filter_by(id=user_id).delete(
                    synchronize_session=False
                )
            legal.db.session.commit()

    def create_user(self, role):
        with legal.app.app_context():
            user = legal.User(
                name="SMTP test",
                email=f"smtp-test-{role}-{len(self.user_ids)}@example.invalid",
                password_hash=legal.hash_password("test-only-password"),
                role=role,
            )
            legal.db.session.add(user)
            legal.db.session.commit()
            self.user_ids.append(user.id)
            return user.id

    def test_missing_configuration_fails_before_connecting(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(legal.smtplib, "SMTP") as smtp:
            self.assertFalse(legal.smtp_is_configured())
            with self.assertRaises(legal.EmailConfigurationError) as raised:
                legal.send_email_smtp("recipient@example.com", "Subject", "Message", [])

        self.assertIn("contact the administrator", str(raised.exception))
        smtp.assert_not_called()

    def test_smtp_message_uses_configured_sender_and_secure_multipart_content(self):
        pdf_bytes = b"%PDF-1.4 test attachment"
        attachment = {
            "filename": "agreement.pdf",
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
        }
        with patch.dict(os.environ, SMTP_ENV, clear=False), patch.object(legal.smtplib, "SMTP") as smtp:
            server = smtp.return_value
            server.send_message.return_value = {}
            message_id = legal.send_email_smtp(
                "recipient@example.com",
                "Legal agreement",
                "Name: Sender\nEmail: sender@example.net\n\nPlease review.",
                [attachment],
                "<p>Sender: Sender &lt;sender@example.net&gt;</p>",
            )

        server.starttls.assert_called_once()
        server.login.assert_called_once_with(SMTP_ENV["SMTP_USERNAME"], TEST_APP_PASSWORD)
        sent_message = server.send_message.call_args.args[0]
        self.assertEqual(str(sent_message["From"]), "AI Legal <website@example.com>")
        self.assertEqual(str(sent_message["To"]), "recipient@example.com")
        self.assertNotIn("Reply-To", sent_message)
        self.assertEqual(server.send_message.call_args.kwargs["from_addr"], SMTP_ENV["SMTP_FROM_EMAIL"])
        self.assertEqual(server.send_message.call_args.kwargs["to_addrs"], ["recipient@example.com"])
        self.assertIn("sender@example.net", sent_message.get_body(("plain",)).get_content())
        self.assertIn("sender@example.net", sent_message.get_body(("html",)).get_content())
        attached_parts = list(sent_message.iter_attachments())
        self.assertEqual(len(attached_parts), 1)
        self.assertEqual(attached_parts[0].get_filename(), "agreement.pdf")
        self.assertEqual(attached_parts[0].get_content(), pdf_bytes)
        self.assertNotIn(TEST_APP_PASSWORD, sent_message.as_string())
        self.assertEqual(message_id, str(sent_message["Message-ID"]))
        server.quit.assert_called_once()

    def test_smtp_authentication_failure_is_safe_and_closes_connection(self):
        with patch.dict(os.environ, SMTP_ENV, clear=False), patch.object(legal.smtplib, "SMTP") as smtp:
            server = smtp.return_value
            server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"internal test detail")
            with self.assertRaises(legal.EmailProviderError) as raised:
                legal.send_email_smtp("recipient@example.com", "Subject", "Message", [])

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(
            str(raised.exception),
            "Unable to authenticate with the email service. Please contact the administrator.",
        )
        self.assertNotIn(TEST_APP_PASSWORD, str(raised.exception))
        server.quit.assert_called_once()

    def test_connection_failure_returns_safe_service_message(self):
        with patch.dict(os.environ, SMTP_ENV, clear=False), patch.object(
            legal.smtplib, "SMTP", side_effect=OSError("internal test detail")
        ):
            with self.assertRaises(legal.EmailProviderError) as raised:
                legal.send_email_smtp("recipient@example.com", "Subject", "Message", [])

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(
            str(raised.exception),
            "Unable to connect to the email service. Please try again later.",
        )
        self.assertNotIn("internal test detail", str(raised.exception))

    def test_normal_user_and_admin_can_send_through_authenticated_route(self):
        for role in ("user", "admin"):
            with self.subTest(role=role):
                user_id = self.create_user(role)
                token = legal.generate_token(user_id)
                attachment_bytes = b"%PDF-1.4 route attachment"
                payload = {
                    "to": "recipient@example.com",
                    "sender_name": "Informational Sender",
                    "sender_email": "sender@example.net",
                    "subject": "Legal document",
                    "message": "Please review the attached document.",
                    "attachment": {
                        "filename": "document.pdf",
                        "contentType": "application/pdf",
                        "contentBase64": base64.b64encode(attachment_bytes).decode("ascii"),
                    },
                }
                with patch.dict(os.environ, SMTP_ENV, clear=False), patch.object(
                    legal.smtplib, "SMTP"
                ) as smtp:
                    smtp.return_value.send_message.return_value = {}
                    response = legal.app.test_client().post(
                        "/api/send-email",
                        headers={"Authorization": f"Bearer {token}"},
                        json=payload,
                    )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["status"], "sent")
                self.assertTrue(response.get_json()["messageId"])
                sent_message = smtp.return_value.send_message.call_args.args[0]
                self.assertEqual(str(sent_message["From"]), "AI Legal <website@example.com>")
                self.assertIn("Informational Sender", sent_message.get_body(("plain",)).get_content())
                self.assertEqual(
                    list(sent_message.iter_attachments())[0].get_filename(),
                    "document.pdf",
                )
                with legal.app.app_context():
                    history = legal.SentEmail.query.filter_by(user_id=user_id).one()
                    self.assertEqual(history.status, "sent")
                    self.assertEqual(history.sender_email, "sender@example.net")
                    self.assertEqual(history.message_id, response.get_json()["messageId"])
                    self.assertNotIn(TEST_APP_PASSWORD, history.body)

    def test_unauthenticated_route_does_not_open_smtp_connection(self):
        with patch.dict(os.environ, SMTP_ENV, clear=False), patch.object(legal.smtplib, "SMTP") as smtp:
            response = legal.app.test_client().post(
                "/api/send-email",
                json={
                    "to": "recipient@example.com",
                    "sender_name": "Sender",
                    "sender_email": "sender@example.net",
                    "subject": "Subject",
                    "message": "Message",
                },
            )

        self.assertEqual(response.status_code, 401)
        smtp.assert_not_called()


if __name__ == "__main__":
    unittest.main()