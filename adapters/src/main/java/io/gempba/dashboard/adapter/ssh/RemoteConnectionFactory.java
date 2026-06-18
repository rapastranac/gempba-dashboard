package io.gempba.dashboard.adapter.ssh;

import io.gempba.dashboard.auth.AuthPrompt;
import io.gempba.dashboard.config.SessionSpec;

import java.io.IOException;
import java.nio.file.Path;

/**
 * How the connection controller obtains a {@link RemoteConnection} — normally
 * {@link RemoteConnection#connect}, but injectable so the controller's
 * connect-once / listen-many sequencing can be tested with a stub that returns a
 * fake connection instead of doing real SSH.
 */
@FunctionalInterface
public interface RemoteConnectionFactory {

    RemoteConnection connect(SessionSpec sessionSpec, AuthPrompt authPrompt, Path knownHosts) throws IOException;
}
