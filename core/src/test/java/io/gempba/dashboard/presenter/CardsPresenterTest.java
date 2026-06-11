package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.StructureKey;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.CardsView;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CardsPresenterTest {

    private static WorldSnapshot snap() {
        return new WorldSnapshot(1, 1L, 0L, List.of(), StructureKey.empty());
    }

    @Test
    void renders_only_while_active() {
        FakeCardsView view = new FakeCardsView();
        CardsPresenter p = new CardsPresenter(view);

        p.update(snap());                 // inactive → no render
        assertThat(view.renders).isZero();

        p.activate(null);                 // active, nothing to paint yet
        assertThat(view.renders).isZero();

        p.update(snap());                 // active → render
        assertThat(view.renders).isEqualTo(1);
    }

    @Test
    void activate_paints_last_then_deactivate_clears_and_stops() {
        FakeCardsView view = new FakeCardsView();
        CardsPresenter p = new CardsPresenter(view);

        p.activate(snap());               // paints from last
        assertThat(view.renders).isEqualTo(1);

        p.deactivate();
        assertThat(view.clears).isEqualTo(1);

        p.update(snap());                 // inactive → no further render
        assertThat(view.renders).isEqualTo(1);
    }

    @Test
    void clear_clears_the_cards() {
        FakeCardsView view = new FakeCardsView();
        CardsPresenter p = new CardsPresenter(view);
        p.clear();
        assertThat(view.clears).isEqualTo(1);
    }

    private static final class FakeCardsView implements CardsView {
        int renders = 0;
        int clears = 0;

        @Override
        public void render(WorldSnapshot snapshot) {
            renders++;
        }

        @Override
        public void clear() {
            clears++;
        }
    }
}
