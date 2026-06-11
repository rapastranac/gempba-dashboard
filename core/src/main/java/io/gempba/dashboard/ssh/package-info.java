/**
 * Pure SSH command authoring: building, rendering, tokenizing, and parsing the
 * {@code ssh -N -L ...} tunnel command, with no process or socket IO. Living in
 * {@code core} lets a command preview be rendered without pulling in any IO;
 * the actual tunnel spawning deliberately stays outside this package.
 */
package io.gempba.dashboard.ssh;
