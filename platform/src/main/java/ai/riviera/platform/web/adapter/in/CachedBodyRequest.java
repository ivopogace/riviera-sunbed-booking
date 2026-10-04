package ai.riviera.platform.web.adapter.in;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

/**
 * A request whose body an edge filter already read, within its cap, into {@code body}: served afresh on
 * each {@code getInputStream()} / {@code getReader()}, so the controller's {@code @RequestBody} still
 * binds it. Synchronous reads only.
 */
final class CachedBodyRequest extends HttpServletRequestWrapper {

	private final byte[] body;

	CachedBodyRequest(HttpServletRequest request, byte[] body) {
		super(request);
		this.body = body;
	}

	@Override
	public ServletInputStream getInputStream() {
		ByteArrayInputStream source = new ByteArrayInputStream(body);
		return new ServletInputStream() {
			@Override
			public int read() {
				return source.read();
			}

			@Override
			public int read(byte[] buffer, int offset, int length) {
				return source.read(buffer, offset, length);
			}

			@Override
			public boolean isFinished() {
				return source.available() == 0;
			}

			@Override
			public boolean isReady() {
				return true;
			}

			@Override
			public void setReadListener(ReadListener readListener) {
				throw new UnsupportedOperationException("async reads are not used on the API");
			}
		};
	}

	@Override
	public BufferedReader getReader() {
		return new BufferedReader(new InputStreamReader(getInputStream(), charset()));
	}

	private Charset charset() {
		String encoding = getCharacterEncoding();
		return encoding != null ? Charset.forName(encoding) : StandardCharsets.UTF_8;
	}
}
