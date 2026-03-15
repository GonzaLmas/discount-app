import { useState, useMemo, useEffect, useReducer, useRef } from "react";

const TNA_FALLBACK = 25;
const INFLACION_FALLBACK = 3.0;
const FCI_NOMBRE = "mercado fondo";
const FCI_CLASE = "a";
const CUOTAS_LIST = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];

const calcDescuento = (monto, pct) => (monto > 0 ? monto * (1 - pct / 100) : 0);

function calcCuota(monto, tasaMensual, n) {
  if (monto <= 0 || n <= 0) return { cuota: 0, total: 0 };
  if (tasaMensual === 0) return { cuota: monto / n, total: monto };
  const i = tasaMensual / 100;
  const c = (monto * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1);
  return { cuota: c, total: c * n };
}

function vpNominal(cuota, n, rMens) {
  let s = 0;
  for (let k = 1; k <= n; k++) s += cuota / Math.pow(1 + rMens, k);
  return s;
}

function calcBreakEven(cuota, n, precioDesc) {
  if (cuota <= 0 || precioDesc <= 0) return null;
  if (cuota * n <= precioDesc) return 0;
  const f = (r) => vpNominal(cuota, n, r) - precioDesc;
  if (f(0) <= 0) return 0;
  let lo = 0,
    hi = 5;
  if (f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    f(m) > 0 ? (lo = m) : (hi = m);
  }
  return ((lo + hi) / 2) * 12 * 100;
}

function getSemaforo(tna) {
  if (tna === null) return "gray";
  if (tna === 0) return "green";
  if (tna < 19) return "green";
  if (tna <= 29) return "yellow";
  return "blue";
}

function getBELabel(tna) {
  if (tna === null) return null;
  if (tna === 0) return "siempre conviene en cuotas";
  const c = getSemaforo(tna);
  const s = `TNA >${tna.toFixed(1)}%`;
  if (c === "green") return `${s} · cuotas ganan`;
  if (c === "yellow") return `${s} · zona de duda`;
  return `${s} · descuento casi siempre gana`;
}

const fmt = (n) =>
  n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

const SEMAFORO_CLASSES = {
  green: {
    tag: "bg-green-950 text-green-600 border border-green-900",
    bar: "bg-green-800",
  },
  yellow: {
    tag: "bg-orange-950 text-orange-400 border border-orange-800",
    bar: "bg-orange-500",
  },
  blue: {
    tag: "bg-blue-950 text-blue-400 border border-blue-800",
    bar: "bg-blue-500",
  },
  gray: {
    tag: "bg-zinc-800 text-zinc-500 border border-zinc-700",
    bar: "bg-zinc-600",
  },
};

function useTnaMP() {
  const [tna, setTna] = useState(TNA_FALLBACK);
  const [status, setSt] = useState("loading");
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    const B = "https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero";
    const find = (arr) =>
      Array.isArray(arr)
        ? arr.find(
            (f) =>
              f.fondo.toLowerCase().includes(FCI_NOMBRE) &&
              f.fondo.toLowerCase().includes(`clase ${FCI_CLASE}`),
          )
        : null;

    const run = async () => {
      const [ultData, penData] = await Promise.all([
        fetch(`${B}/ultimo`).then((r) => r.json()),
        fetch(`${B}/penultimo`).then((r) => r.json()),
      ]);
      const ult = find(ultData);
      const pen = find(penData);
      if (!ult || !pen) throw new Error();
      const dias = Math.max(
        1,
        Math.round((new Date(ult.fecha) - new Date(pen.fecha)) / 86400000),
      );
      const rendDiario = (ult.vcp / pen.vcp - 1) / dias;
      setTna(parseFloat((rendDiario * 365 * 100).toFixed(2)));
      setFecha(ult.fecha);
      setSt("ok");
    };
    run().catch(() => setSt("error"));
  }, []);
  return { tna, status, fecha };
}

function useInflacion() {
  const [ultimo, setUltimo] = useState(INFLACION_FALLBACK);
  const [status, setSt] = useState("loading");
  const [fecha, setFecha] = useState("");
  useEffect(() => {
    fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion")
      .then((r) => r.json())
      .then((data) => {
        const last = data.reduce((a, b) => (a.fecha > b.fecha ? a : b));
        setUltimo(last.valor);
        setFecha(last.fecha.slice(0, 7));
        setSt("ok");
      })
      .catch(() => setSt("error"));
  }, []);
  return { ultimo, status, fecha };
}

const initialState = {
  monto: "",
  descuento: 10,
  tasaPreset: 8,
  sinInteres: new Set([1, 2, 3, 4, 5, 6]),
  overrides: {},
  tnaBilletera: TNA_FALLBACK,
};

function reducer(s, a) {
  switch (a.type) {
    case "SET_MONTO":
      return { ...s, monto: a.v };
    case "SET_DESCUENTO":
      return { ...s, descuento: a.v };
    case "SET_TASA_PRESET":
      return { ...s, tasaPreset: a.v };
    case "SET_TNA":
      return { ...s, tnaBilletera: a.v };
    case "TOGGLE_SI": {
      const n = new Set(s.sinInteres);
      n.has(a.n) ? n.delete(a.n) : n.add(a.n);
      return { ...s, sinInteres: n };
    }
    case "SET_OVERRIDE":
      return { ...s, overrides: { ...s.overrides, [a.n]: a.v } };
    case "CLEAR_OVERRIDE": {
      const o = { ...s.overrides };
      delete o[a.n];
      return { ...s, overrides: o };
    }
    default:
      return s;
  }
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99,
  badge,
  hint,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">
          {label}
        </span>
        {badge && (
          <span className="font-mono text-xs text-yellow-500">{badge}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            onChange(Math.max(min, parseFloat((value - step).toFixed(2))))
          }
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 hover:border-yellow-500 transition-colors"
        >
          −
        </button>
        <div className="relative flex-1 min-w-0">
          <input
            type="number"
            value={value || ""}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 font-mono text-xl font-bold text-center py-2 pr-7 pl-2 focus:outline-none focus:border-yellow-500"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-500">
            %
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange(Math.min(max, parseFloat((value + step).toFixed(2))))
          }
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 hover:border-yellow-500 transition-colors"
        >
          +
        </button>
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function InputsPanel({ state, dispatch, tnaMeta }) {
  const { monto, descuento, tasaPreset, sinInteres, tnaBilletera } = state;

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">
          Monto original
        </span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-lg text-zinc-500">
            $
          </span>
          <input
            type="number"
            value={monto}
            onChange={(e) => dispatch({ type: "SET_MONTO", v: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 font-mono text-2xl font-bold pl-8 pr-4 py-3 focus:outline-none focus:border-yellow-500"
          />
        </div>
      </div>
      <Stepper
        label="Descuento al contado"
        value={descuento}
        onChange={(v) => dispatch({ type: "SET_DESCUENTO", v })}
      />
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">
          Cuotas sin interés
        </span>
        <div className="flex flex-wrap gap-1.5">
          {CUOTAS_LIST.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => dispatch({ type: "TOGGLE_SI", n })}
              className={`w-9 h-9 rounded-lg font-mono text-sm ${sinInteres.has(n) ? "bg-green-950 border border-green-700 text-green-400" : "bg-zinc-800 border border-zinc-700 text-zinc-400"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <Stepper
        label="Tasa mensual base"
        value={tasaPreset}
        step={0.5}
        onChange={(v) => dispatch({ type: "SET_TASA_PRESET", v })}
      />
      <Stepper
        label="TNA Billetera"
        value={tnaBilletera}
        step={0.5}
        onChange={(v) => dispatch({ type: "SET_TNA", v })}
        hint={
          tnaMeta.status === "ok"
            ? `Sincronizado: ${tnaMeta.tna}%`
            : "Ajuste manual"
        }
      />
    </div>
  );
}

function FilaResultado({ fila, minVP, isContado, pctDesc, ahorro, isFirst }) {
  const color = getSemaforo(fila.be);
  const barW = fila.vp > 0 ? (minVP / fila.vp) * 100 : 0;

  const label = isContado
    ? "Pago al contado"
    : `${fila.n} cuotas ${fila.sinInteres ? "🚀" : ""}`;

  const subLabel = isContado ? (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700 break-words">
      {pctDesc}% de descuento · ahorrás {fmt(ahorro)}
    </span>
  ) : (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded break-words ${
        isFirst
          ? "bg-green-900 text-green-300 border border-green-600"
          : SEMAFORO_CLASSES[color].tag
      }`}
    >
      {getBELabel(fila.be)}
    </span>
  );

  return (
    <div
      className={`px-3 py-3 border-b border-zinc-800 last:border-0 transition-colors overflow-hidden
        ${isFirst ? "bg-green-950/30" : isContado ? "bg-zinc-900/50" : ""}`}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span
            className={`text-sm font-semibold truncate ${isFirst ? "text-green-300" : "text-zinc-100"}`}
          >
            {isFirst && "⭐ "}
            {label}
          </span>
          <div className="min-w-0">{subLabel}</div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`font-mono text-sm font-bold ${isFirst ? "text-green-400" : "text-zinc-100"}`}
          >
            {fmt(fila.cuota)}{" "}
            <span className="text-zinc-500 text-[10px] font-normal">
              {isContado ? "total" : "/mes"}
            </span>
          </div>
          {!isContado && (
            <div className="font-mono text-[10px] text-zinc-500 italic">
              Total {fmt(fila.total)}
            </div>
          )}
        </div>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isFirst
              ? "bg-green-500"
              : isContado
                ? "bg-teal-600"
                : SEMAFORO_CLASSES[color].bar
          }`}
          style={{ width: `${barW}%` }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tnaMeta = useTnaMP();
  const inflMeta = useInflacion();

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const tnaSynced = useRef(false);
  useEffect(() => {
    if (tnaMeta.status === "ok" && !tnaSynced.current) {
      dispatch({ type: "SET_TNA", v: tnaMeta.tna });
      tnaSynced.current = true;
    }
  }, [tnaMeta.status, tnaMeta.tna]);

  const { monto, descuento, tasaPreset, sinInteres, overrides, tnaBilletera } =
    state;
  const montoNum = parseFloat(monto) || 0;
  const precioDesc = useMemo(
    () => calcDescuento(montoNum, descuento),
    [montoNum, descuento],
  );
  const rMens = tnaBilletera / 100 / 12;

  const filas = useMemo(() => {
    return CUOTAS_LIST.map((n) => {
      const tasa = sinInteres.has(n) ? 0 : (overrides[n] ?? tasaPreset);
      const { cuota, total } = calcCuota(montoNum, tasa, n);
      const vp = vpNominal(cuota, n, rMens);
      const be = calcBreakEven(cuota, n, precioDesc);
      return { n, cuota, total, vp, be, sinInteres: sinInteres.has(n), tasa };
    });
  }, [montoNum, tasaPreset, sinInteres, overrides, precioDesc, rMens]);

  const todasOpciones = useMemo(() => {
    if (montoNum <= 0) return [];
    const contado = {
      n: 0,
      cuota: precioDesc,
      total: precioDesc,
      vp: precioDesc,
      be: null,
      sinInteres: false,
      tasa: 0,
      esContado: true,
    };
    return [contado, ...filas.map((f) => ({ ...f, esContado: false }))].sort(
      (a, b) => a.vp - b.vp,
    );
  }, [filas, precioDesc, montoNum]);

  const minVP = todasOpciones.length > 0 ? todasOpciones[0].vp : 1;

  return (
    <div
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-100 p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <header className="lg:col-span-2 mb-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Cuotas vs Descuento
          </h1>
          <p className="text-zinc-500 text-sm">
            Calculá la mejor opción según el valor real del dinero
          </p>
        </header>

        <aside className="hidden lg:block bg-zinc-900 border border-zinc-800 rounded-2xl h-fit sticky top-6">
          <InputsPanel
            state={state}
            dispatch={dispatch}
            tnaMeta={tnaMeta}
            inflMeta={inflMeta}
          />
        </aside>

        <main className="flex flex-col gap-6 min-w-0">
          {montoNum <= 0 ? (
            <div className="h-64 border-2 border-dashed border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-600 font-medium">
              Esperando monto para calcular...
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-inner">
              <div className="px-4 py-2 bg-zinc-950/50 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500 tracking-wider">
                Opciones ordenadas por conveniencia
              </div>
              {todasOpciones.map((f, i) => (
                <FilaResultado
                  key={f.esContado ? "contado" : f.n}
                  fila={f}
                  minVP={minVP}
                  isContado={f.esContado}
                  pctDesc={descuento}
                  ahorro={montoNum - precioDesc}
                  isFirst={i === 0}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden fixed right-6 w-12 h-12 flex items-center justify-center bg-zinc-900 text-zinc-300 rounded-full active:scale-95 transition-all duration-150"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
          border: "1px solid rgba(255,255,255,0.5)",
          boxShadow:
            "0 0 8px rgba(255,255,255,0.25), 0 0 20px rgba(255,255,255,0.1)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end overflow-hidden touch-none"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full bg-zinc-900 rounded-t-3xl p-2 max-h-[90vh] overflow-y-auto shadow-2xl"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <InputsPanel
              state={state}
              dispatch={dispatch}
              tnaMeta={tnaMeta}
              inflMeta={inflMeta}
            />
          </div>
        </div>
      )}
    </div>
  );
}
