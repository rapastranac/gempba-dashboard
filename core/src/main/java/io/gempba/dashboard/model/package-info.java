/**
 * The domain read-model: immutable records the UI renders from. These records
 * hold raw magnitudes only — no formatting, no SWT, no wire types. A
 * {@link io.gempba.dashboard.model.WorldSnapshot} is produced upstream from
 * the wire format once per frame; everything downstream speaks this
 * vocabulary, which is what keeps the views free of the wire.
 */
package io.gempba.dashboard.model;
