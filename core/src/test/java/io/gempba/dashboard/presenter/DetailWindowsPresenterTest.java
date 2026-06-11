package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.StructureKey;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.DetailView;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DetailWindowsPresenterTest {

    private static WorldSnapshot snap() {
        return new WorldSnapshot(1, 1L, 0L, List.of(), StructureKey.empty());
    }

    @Test
    void opens_once_per_host_then_focuses() {
        Map<String, FakeDetailView> made = new HashMap<>();
        DetailWindowsPresenter p = new DetailWindowsPresenter(h -> {
            FakeDetailView v = new FakeDetailView();
            made.put(h, v);
            return v;
        });

        p.update(snap());             // a frame arrives before any window opens
        p.openOrFocus("a");
        p.openOrFocus("a");           // existing → focus, no new window

        FakeDetailView a = made.get("a");
        assertThat(a.opens).isEqualTo(1);
        assertThat(a.focuses).isEqualTo(1);
        assertThat(a.renders).isEqualTo(1);   // seeded with the latest snapshot on open
    }

    @Test
    void update_pushes_to_every_open_window() {
        Map<String, FakeDetailView> made = new HashMap<>();
        DetailWindowsPresenter p = new DetailWindowsPresenter(h -> {
            FakeDetailView v = new FakeDetailView();
            made.put(h, v);
            return v;
        });
        p.openOrFocus("a");
        p.openOrFocus("b");

        p.update(snap());

        assertThat(made.get("a").renders).isEqualTo(1);
        assertThat(made.get("b").renders).isEqualTo(1);
    }

    @Test
    void a_window_disposed_by_the_user_is_dropped_from_later_updates() {
        Map<String, FakeDetailView> made = new HashMap<>();
        DetailWindowsPresenter p = new DetailWindowsPresenter(h -> {
            FakeDetailView v = new FakeDetailView();
            made.put(h, v);
            return v;
        });
        p.openOrFocus("a");
        made.get("a").close();        // user closes it → onDisposed removes it from the map

        p.update(snap());             // must not touch the disposed window
        assertThat(made.get("a").renders).isZero();
    }

    @Test
    void clear_closes_every_window() {
        Map<String, FakeDetailView> made = new HashMap<>();
        DetailWindowsPresenter p = new DetailWindowsPresenter(h -> {
            FakeDetailView v = new FakeDetailView();
            made.put(h, v);
            return v;
        });
        p.openOrFocus("a");
        p.openOrFocus("b");

        p.clear();

        assertThat(made.get("a").closes).isEqualTo(1);
        assertThat(made.get("b").closes).isEqualTo(1);
        // After clear the set is empty — a later update is a no-op.
        p.update(snap());
        assertThat(made.get("a").renders).isZero();
    }

    @Test
    void clear_forgets_the_seed_snapshot() {
        Map<String, FakeDetailView> made = new HashMap<>();
        DetailWindowsPresenter p = new DetailWindowsPresenter(h -> {
            FakeDetailView v = new FakeDetailView();
            made.put(h, v);
            return v;
        });
        p.update(snap());
        p.clear();                    // reconnect: the old target's data must not survive

        p.openOrFocus("a");
        assertThat(made.get("a").renders).isZero();   // opened unseeded
    }

    private static final class FakeDetailView implements DetailView {
        boolean disposed;
        int opens, renders, focuses, closes;
        Runnable onDisposed = () -> {
        };

        @Override
        public void open() {
            opens++;
        }

        @Override
        public void render(WorldSnapshot model) {
            renders++;
        }

        @Override
        public void focus() {
            focuses++;
        }

        @Override
        public void close() {
            closes++;
            disposed = true;
            onDisposed.run();
        }

        @Override
        public boolean isDisposed() {
            return disposed;
        }

        @Override
        public void setOnDisposed(Runnable r) {
            this.onDisposed = r;
        }
    }
}
