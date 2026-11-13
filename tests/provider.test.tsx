import { describe, expect, it, vi } from "vitest";
import { memo } from "react";
import { FancyI18nProvider, defineMessages, useFancyT, type FancyI18nPack } from "../src";
import { mount } from "./helpers";

const MESSAGES = defineMessages({ "demo.modal.close": "Close", "demo.count": ":count file|:count files" });

function Label() {
  const t = useFancyT(MESSAGES);
  return <span>{t("demo.modal.close")}</span>;
}

describe("FancyI18nProvider", () => {
  it("passes host strings to components", () => {
    const m = mount(
      <FancyI18nProvider locale="es" strings={{ "demo.modal.close": "Cerrar" }}>
        <Label />
      </FancyI18nProvider>,
    );
    expect(m.container.textContent).toBe("Cerrar");
    m.unmount();
  });

  it("without a provider, a component renders English", () => {
    const m = mount(<Label />);
    expect(m.container.textContent).toBe("Close");
    m.unmount();
  });

  it("renders no DOM of its own and never sets dir, even for an RTL language", () => {
    const m = mount(
      <FancyI18nProvider locale="ar" strings={{ "demo.modal.close": "إغلاق" }}>
        <Label />
      </FancyI18nProvider>,
    );
    expect(m.container.innerHTML).toBe("<span>إغلاق</span>");
    expect(m.container.querySelector("[dir]")).toBeNull();
    expect(document.documentElement.hasAttribute("dir")).toBe(false);
    m.unmount();
  });

  it("never fetches: no fetch, no XMLHttpRequest", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    const m = mount(
      <FancyI18nProvider locale="de" packs={[{ locale: "de", messages: {} }]}>
        <Label />
      </FancyI18nProvider>,
    );
    m.render(
      <FancyI18nProvider locale="ru">
        <Label />
      </FancyI18nProvider>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    m.unmount();
    vi.unstubAllGlobals();
  });

  it("a component's labels override the provider", () => {
    function Labelled({ closeLabel }: { closeLabel?: string }) {
      const t = useFancyT(MESSAGES, { "demo.modal.close": closeLabel });
      return <span>{t("demo.modal.close")}</span>;
    }
    const m = mount(
      <FancyI18nProvider locale="es" strings={{ "demo.modal.close": "Cerrar" }}>
        <Labelled closeLabel="Salir" />
        <Labelled />
      </FancyI18nProvider>,
    );
    expect(m.container.textContent).toBe("SalirCerrar");
    m.unmount();
  });
});

describe("two installed copies share one context", () => {
  it("a component built against copy B reads copy A's provider", async () => {
    // resetModules drops the source modules from the registry, so the second
    // import evaluates fancy-i18n again: a second, independent copy, which is
    // what a resolver installing two versions produces. React is an external
    // dependency and stays one instance, as it must in any working app.
    vi.resetModules();
    const a = await import("../src/index");
    vi.resetModules();
    const b = await import("../src/index");
    expect(a.FancyI18nProvider).not.toBe(b.FancyI18nProvider);
    expect(a.FancyI18nContext).toBe(b.FancyI18nContext);

    function FromB() {
      const t = b.useFancyT(MESSAGES);
      return <span>{t("demo.modal.close")}</span>;
    }
    const m = mount(
      <a.FancyI18nProvider locale="es" strings={{ "demo.modal.close": "Cerrar" }}>
        <FromB />
      </a.FancyI18nProvider>,
    );
    expect(m.container.textContent).toBe("Cerrar");
    m.unmount();
  });
});

describe("reference identity: the lag risk (performance budget, deterministic part)", () => {
  const N = 2000;
  let renders = 0;
  const Consumer = memo(function Consumer() {
    renders++;
    const t = useFancyT(MESSAGES);
    return <i>{t("demo.modal.close")}</i>;
  });
  const consumers = Array.from({ length: N }, (_, i) => <Consumer key={i} />);

  type HostProps = {
    tick: number;
    locale: string;
    strings?: Record<string, string>;
    version?: string;
    packs?: FancyI18nPack[];
    onMissingKey?: (key: string, locale: string) => void;
    pluralRules?: Record<string, string>;
  };
  function Host({ tick, ...props }: HostProps) {
    return (
      <div data-tick={tick}>
        <FancyI18nProvider {...props}>{consumers}</FancyI18nProvider>
      </div>
    );
  }

  it("20 parent re-renders with a stable provider cause 0 consumer re-renders", () => {
    const strings = { "demo.modal.close": "Cerrar" };
    const m = mount(<Host tick={0} locale="es" strings={strings} />);
    renders = 0;
    for (let i = 1; i <= 20; i++) m.render(<Host tick={i} locale="es" strings={strings} />);
    expect(renders).toBe(0);
    m.unmount();
  });

  it("a NEW strings object with the same version causes 0 re-renders (Inertia hands a new prop per visit)", () => {
    const m = mount(<Host tick={0} locale="es" version="h1" strings={{ "demo.modal.close": "Cerrar" }} />);
    renders = 0;
    for (let i = 1; i <= 20; i++) m.render(<Host tick={i} locale="es" version="h1" strings={{ "demo.modal.close": "Cerrar" }} />);
    expect(renders).toBe(0);
    m.unmount();
  });

  it("a new version re-renders each consumer exactly once", () => {
    const m = mount(<Host tick={0} locale="es" version="h1" strings={{ "demo.modal.close": "Cerrar" }} />);
    renders = 0;
    m.render(<Host tick={1} locale="es" version="h2" strings={{ "demo.modal.close": "Cerrar ya" }} />);
    expect(renders).toBe(N);
    expect(m.container.querySelector("i")?.textContent).toBe("Cerrar ya");
    m.unmount();
  });

  it("inline packs arrays, plural rules and onMissingKey do not break identity", () => {
    const es: FancyI18nPack = { locale: "es", messages: { "demo.modal.close": "Cerrar" } };
    const m = mount(<Host tick={0} locale="es" packs={[es]} pluralRules={{ ksw: "one" }} onMissingKey={() => {}} />);
    renders = 0;
    for (let i = 1; i <= 20; i++) {
      m.render(<Host tick={i} locale="es" packs={[es]} pluralRules={{ ksw: "one" }} onMissingKey={() => {}} />);
    }
    expect(renders).toBe(0);
    m.unmount();
  });

  it("calls the newest onMissingKey without rebuilding the catalog", () => {
    const first = vi.fn();
    const second = vi.fn();
    const KEYS = defineMessages({ "demo.a": "A", "demo.b": "B" });
    const Show = memo(function Show({ k }: { k: keyof typeof KEYS }) {
      const t = useFancyT(KEYS);
      return <b>{t(k)}</b>;
    });
    function H({ cb, k }: { cb: (key: string, locale: string) => void; k: keyof typeof KEYS }) {
      return (
        <FancyI18nProvider locale="de" onMissingKey={cb}>
          <Show k={k} />
        </FancyI18nProvider>
      );
    }
    const m = mount(<H cb={first} k="demo.a" />);
    m.render(<H cb={second} k="demo.b" />);
    expect(first.mock.calls).toEqual([["demo.a", "de"]]);
    expect(second.mock.calls).toEqual([["demo.b", "de"]]);
    m.unmount();
  });

  it("a locale change re-renders each consumer exactly once", () => {
    const m = mount(<Host tick={0} locale="es" strings={{ "demo.modal.close": "Cerrar" }} />);
    renders = 0;
    m.render(<Host tick={1} locale="de" strings={{ "demo.modal.close": "Schließen" }} />);
    expect(renders).toBe(N);
    m.unmount();
  });
});
