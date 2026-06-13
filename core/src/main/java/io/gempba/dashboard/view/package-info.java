/**
 * View contracts. These interfaces describe what a presenter can ask of a view
 * (render this model, show this window) without naming a UI toolkit, so
 * orchestration is written against the contract and any widget implementation
 * can plug in. The Supervising-Presenter flavour of MVP: views hold no state
 * and pull no data — they are told what to show, and format only trivial
 * values themselves. Part of {@code core}.
 */
package io.gempba.dashboard.view;
