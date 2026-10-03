package ai.riviera.authplacementfixture.notification.adapter.out;

import org.eclipse.angus.mail.smtp.SMTPTransport;
import org.springframework.mail.MailSender;

/** The mail control: the module sends mail, so no mail family is checked here and this stays clean. */
public class MailTransport {

	MailSender springMail;

	jakarta.mail.Session jakartaMail;

	SMTPTransport angusMail;
}
