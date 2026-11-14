package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * A throwaway SNS signing PKI minted at test time with the JDK's {@code keytool}, so no key material is
 * committed and nothing expires in the repo: a CA, a signer the CA issued, and a self-signed rogue signer.
 * {@link #signedBody} builds a Scaleway Topics &amp; Events message signed as signature version 1.
 */
final class SnsTestPki {

	static final String TOPIC_ARN = "arn:scw:sns:fr-par:project-test:riviera-tem-events";
	static final String CERT_URL = "https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_1.crt";
	static final String ROGUE_CERT_URL = "https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_9.crt";

	private static final String STORE_PASSWORD = "test-only";
	private static final SnsTestPki INSTANCE = new SnsTestPki();

	private final Path dir;
	private final byte[] caPem;
	private final byte[] signerCert;
	private final byte[] rogueCert;
	private final PrivateKey signerKey;
	private final PrivateKey rogueKey;

	private SnsTestPki() {
		try {
			dir = Files.createTempDirectory("sns-test-pki");
			keytool("-genkeypair", "-alias", "ca", "-keyalg", "RSA", "-keysize", "2048", "-dname", "CN=test-sns-ca",
					"-ext", "bc:c", "-validity", "3650", "-keystore", store("ca"));
			keytool("-genkeypair", "-alias", "signer", "-keyalg", "RSA", "-keysize", "2048", "-dname",
					"CN=test-sns-signer", "-validity", "3650", "-keystore", store("signer"));
			keytool("-certreq", "-alias", "signer", "-keystore", store("signer"), "-file", file("signer.csr"));
			keytool("-gencert", "-alias", "ca", "-keystore", store("ca"), "-infile", file("signer.csr"), "-outfile",
					file("signer.crt"), "-validity", "3650", "-rfc");
			keytool("-exportcert", "-alias", "ca", "-keystore", store("ca"), "-rfc", "-file", file("ca.pem"));
			keytool("-genkeypair", "-alias", "rogue", "-keyalg", "RSA", "-keysize", "2048", "-dname",
					"CN=test-sns-rogue", "-validity", "3650", "-keystore", store("rogue"));
			keytool("-exportcert", "-alias", "rogue", "-keystore", store("rogue"), "-rfc", "-file", file("rogue.crt"));
			caPem = Files.readAllBytes(dir.resolve("ca.pem"));
			signerCert = Files.readAllBytes(dir.resolve("signer.crt"));
			rogueCert = Files.readAllBytes(dir.resolve("rogue.crt"));
			signerKey = privateKey("signer");
			rogueKey = privateKey("rogue");
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		catch (GeneralSecurityException | InterruptedException e) {
			throw new IllegalStateException("could not mint the test SNS PKI", e);
		}
	}

	static SnsTestPki get() {
		return INSTANCE;
	}

	/** The CA as a PEM file, the trust chain a deployment configures. */
	Path caPemFile() {
		return dir.resolve("ca.pem");
	}

	byte[] caPem() {
		return caPem.clone();
	}

	/** The certificate each URL serves: the CA-issued signer and the self-signed rogue. */
	Map<String, byte[]> servedCertificates() {
		return Map.of(CERT_URL, signerCert.clone(), ROGUE_CERT_URL, rogueCert.clone());
	}

	/** A {@code Notification} carrying {@code message}, signed by the CA-issued signer. */
	String notification(String message) {
		return signedBody(notificationFields(message), signerKey);
	}

	Map<String, String> notificationFields(String message) {
		Map<String, String> fields = new LinkedHashMap<>();
		fields.put("Type", "Notification");
		fields.put("MessageId", "6e4c1a6e-8a43-4b1b-9b52-0b6c3a51e0f1");
		fields.put("TopicArn", TOPIC_ARN);
		fields.put("Message", message);
		fields.put("Timestamp", "2026-11-14T09:00:00Z");
		fields.put("SignatureVersion", "1");
		fields.put("SigningCertURL", CERT_URL);
		return fields;
	}

	Map<String, String> subscriptionFields(String subscribeUrl) {
		Map<String, String> fields = new LinkedHashMap<>();
		fields.put("Type", "SubscriptionConfirmation");
		fields.put("MessageId", "0f2d7a1c-31e5-4d0b-8c2e-7d8a9b6c5e4f");
		fields.put("Token", "test-subscription-token");
		fields.put("TopicArn", TOPIC_ARN);
		fields.put("Message", "You have chosen to subscribe to the topic.");
		fields.put("SubscribeURL", subscribeUrl);
		fields.put("Timestamp", "2026-11-14T09:00:00Z");
		fields.put("SignatureVersion", "1");
		fields.put("SigningCertURL", CERT_URL);
		return fields;
	}

	/** {@code fields} as a JSON body with a v1 signature by the CA-issued signer. */
	String signed(Map<String, String> fields) {
		return signedBody(fields, signerKey);
	}

	/** {@code fields} signed by the self-signed rogue, served from {@link #ROGUE_CERT_URL}. */
	String signedByRogue(Map<String, String> fields) {
		Map<String, String> rogue = new LinkedHashMap<>(fields);
		rogue.put("SigningCertURL", ROGUE_CERT_URL);
		return signedBody(rogue, rogueKey);
	}

	/** {@code fields} plus a {@code Signature} over the AWS SNS v1 canonical string. */
	static String signedBody(Map<String, String> fields, PrivateKey key) {
		try {
			Signature signer = Signature.getInstance("SHA1withRSA");
			signer.initSign(key);
			signer.update(canonical(fields).getBytes(StandardCharsets.UTF_8));
			Map<String, String> body = new LinkedHashMap<>(fields);
			body.put("Signature", Base64.getEncoder().encodeToString(signer.sign()));
			return json(body);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	/** {@code fields} as JSON, with no signature: the shape a forger without a key can send. */
	static String json(Map<String, String> fields) {
		StringBuilder json = new StringBuilder("{");
		fields.forEach((name, value) -> json.append(json.length() > 1 ? "," : "")
				.append('"').append(name).append("\":\"").append(escape(value)).append('"'));
		return json.append('}').toString();
	}

	/** Written independently of production: AWS's documented key order, absent keys skipped. */
	private static String canonical(Map<String, String> fields) {
		List<String> keys = "Notification".equals(fields.get("Type"))
				? List.of("Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type")
				: List.of("Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type");
		StringBuilder canonical = new StringBuilder();
		for (String key : keys) {
			if (fields.containsKey(key)) {
				canonical.append(key).append('\n').append(fields.get(key)).append('\n');
			}
		}
		return canonical.toString();
	}

	private static String escape(String value) {
		return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
	}

	private PrivateKey privateKey(String alias) throws IOException, GeneralSecurityException {
		KeyStore store = KeyStore.getInstance("PKCS12");
		try (InputStream in = Files.newInputStream(dir.resolve(alias + ".p12"))) {
			store.load(in, STORE_PASSWORD.toCharArray());
		}
		return (PrivateKey) store.getKey(alias, STORE_PASSWORD.toCharArray());
	}

	private String store(String name) {
		return file(name + ".p12");
	}

	private String file(String name) {
		return dir.resolve(name).toString();
	}

	private static void keytool(String... args) throws IOException, InterruptedException {
		String exe = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
		List<String> command = new ArrayList<>(List.of(
				Path.of(System.getProperty("java.home"), "bin", exe).toString()));
		command.addAll(List.of(args));
		command.addAll(List.of("-storetype", "PKCS12", "-storepass", STORE_PASSWORD, "-noprompt"));
		Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
		String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) {
			throw new IllegalStateException("keytool " + args[0] + " failed: " + output);
		}
	}
}
