import { useState, useEffect, useRef, useMemo } from "react";

/* ---------- helpers ---------- */
const todayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const n = (v) => {
  const x = parseFloat(v);
  return isNaN(x) ? 0 : x;
};
const r1 = (v) => Math.round(v * 10) / 10;

const DEFAULT_GOALS = { calories: 2000, protein: 120, carbs: 200, fat: 65, water: 8 };
const EMPTY_FOOD = { name: "", serving: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sodium: "" };
const STORE_KEY = "foodtracker:data:v1";

const NUTRIENT_FIELDS = [
  ["calories", "Calories", "kcal"],
  ["protein", "Protein", "g"],
  ["carbs", "Carbs", "g"],
  ["fat", "Fat", "g"],
  ["fiber", "Fiber", "g"],
  ["sugar", "Sugar", "g"],
  ["sodium", "Sodium", "mg"],
];

function weekDates(anchor) {
  const d = new Date(anchor + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon);
    dd.setDate(mon.getDate() + i);
    return todayKey(dd);
  });
}
const dayLabel = (key) => new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
const dayNum = (key) => new Date(key + "T12:00:00").getDate();
const niceDate = (key) =>
  new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/* ---------- ring ---------- */
function Ring({ pct, size = 170, stroke = 14, children }) {
  const rr = (size - stroke) / 2;
  const c = 2 * Math.PI * rr;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={rr} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={rr}
          fill="none"
          stroke={clamped >= 1 ? "var(--over)" : "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: "stroke-dashoffset .5s ease, stroke .3s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- macro bar ---------- */
function MacroBar({ label, used, goal, unit }) {
  const pct = goal > 0 ? Math.min(1, used / goal) : 0;
  const left = Math.max(0, r1(goal - used));
  const over = used > goal && goal > 0;
  return (
    <div className="macro">
      <div className="macro-top">
        <span className="macro-label">{label}</span>
        <span className="macro-left">
          {over ? <b className="over-text">{r1(used - goal)}{unit} over</b> : <><b>{left}{unit}</b> left</>}
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct * 100}%`, background: over ? "var(--over)" : "var(--primary)" }} />
      </div>
      <div className="macro-sub">
        {r1(used)} / {goal}{unit}
      </div>
    </div>
  );
}

/* ---------- main app ---------- */
export default function FoodTracker() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("today");
  const [date, setDate] = useState(todayKey());
  const [status, setStatus] = useState("Loading your data…");
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  /* load */
  useEffect(() => {
    (async () => {
      let loaded = null;
      try {
        const res = await window.storage.get(STORE_KEY);
        if (res && res.value) loaded = JSON.parse(res.value);
      } catch (e) {
        // first run
      }
      setData(
        loaded || { foods: [], recipes: [], goals: { ...DEFAULT_GOALS }, logs: {} }
      );
      loadedRef.current = true;
      setStatus("");
    })();
  }, []);

  /* debounced save */
  useEffect(() => {
    if (!loadedRef.current || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORE_KEY, JSON.stringify(data));
        setStatus("");
      } catch (e) {
        setStatus("Couldn't save — changes may be lost. Check your connection.");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  const update = (fn) => setData((d) => fn(structuredClone(d)));

  if (!data)
    return (
      <div className="app">
        <Style />
        <div className="loading">Loading your tracker…</div>
      </div>
    );

  const log = data.logs[date] || { entries: [], water: 0, weight: "" };
  const totals = log.entries.reduce(
    (acc, e) => {
      NUTRIENT_FIELDS.forEach(([k]) => (acc[k] += n(e[k]) * n(e.servings || 1)));
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
  );

  return (
    <div className="app">
      <Style />
      <header className="header">
        <div>
          <div className="app-name">Tidewater</div>
          <div className="app-sub">food &amp; nutrition tracker</div>
        </div>
        <input
          type="date"
          className="date-pick"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </header>

      <nav className="tabs">
        {[
          ["today", "Today"],
          ["library", "Library"],
          ["week", "Week"],
        ].map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {status && <div className="status">{status}</div>}

      {tab === "today" && (
        <TodayView data={data} date={date} log={log} totals={totals} update={update} goLibrary={() => setTab("library")} />
      )}
      {tab === "library" && <LibraryView data={data} update={update} />}
      {tab === "week" && <WeekView data={data} date={date} setDate={setDate} goToday={() => setTab("today")} update={update} />}
    </div>
  );
}

/* ================= TODAY ================= */
function TodayView({ data, date, log, totals, update, goLibrary }) {
  const [search, setSearch] = useState("");
  const [servings, setServings] = useState({});
  const [editGoals, setEditGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState(data.goals);
  const goals = data.goals;

  const items = useMemo(() => {
    const all = [
      ...data.foods.map((f) => ({ ...f, kind: "food" })),
      ...data.recipes.map((r) => ({ ...r, kind: "recipe" })),
    ];
    const q = search.trim().toLowerCase();
    return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  }, [data.foods, data.recipes, search]);

  const calLeft = Math.round(goals.calories - totals.calories);
  const pct = goals.calories > 0 ? totals.calories / goals.calories : 0;

  const addEntry = (item) => {
    const s = n(servings[item.id]) || 1;
    update((d) => {
      const dayLog = d.logs[date] || { entries: [], water: 0, weight: "" };
      dayLog.entries.push({
        id: uid(),
        name: item.name,
        kind: item.kind,
        serving: item.serving,
        servings: s,
        calories: n(item.calories),
        protein: n(item.protein),
        carbs: n(item.carbs),
        fat: n(item.fat),
        fiber: n(item.fiber),
        sugar: n(item.sugar),
        sodium: n(item.sodium),
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });
      d.logs[date] = dayLog;
      return d;
    });
  };

  const removeEntry = (id) =>
    update((d) => {
      d.logs[date].entries = d.logs[date].entries.filter((e) => e.id !== id);
      return d;
    });

  const setWater = (delta) =>
    update((d) => {
      const dayLog = d.logs[date] || { entries: [], water: 0, weight: "" };
      dayLog.water = Math.max(0, (dayLog.water || 0) + delta);
      d.logs[date] = dayLog;
      return d;
    });

  const setWeight = (v) =>
    update((d) => {
      const dayLog = d.logs[date] || { entries: [], water: 0, weight: "" };
      dayLog.weight = v;
      d.logs[date] = dayLog;
      return d;
    });

  const saveGoals = () => {
    update((d) => {
      d.goals = {
        calories: n(goalDraft.calories),
        protein: n(goalDraft.protein),
        carbs: n(goalDraft.carbs),
        fat: n(goalDraft.fat),
        water: Math.max(1, Math.round(n(goalDraft.water)) || 8),
      };
      return d;
    });
    setEditGoals(false);
  };

  return (
    <div className="stack">
      <div className="date-line">{niceDate(date)}</div>

      {/* Remaining ring + macros */}
      <section className="card hero-card">
        <div className="hero">
          <Ring pct={pct}>
            <div className={`ring-num ${calLeft < 0 ? "over-text" : ""}`}>{Math.abs(calLeft)}</div>
            <div className="ring-sub">{calLeft < 0 ? "kcal over" : "kcal left"}</div>
            <div className="ring-tiny">{Math.round(totals.calories)} of {goals.calories} eaten</div>
          </Ring>
          <div className="macros">
            <MacroBar label="Protein" used={totals.protein} goal={goals.protein} unit="g" />
            <MacroBar label="Carbs" used={totals.carbs} goal={goals.carbs} unit="g" />
            <MacroBar label="Fat" used={totals.fat} goal={goals.fat} unit="g" />
          </div>
        </div>
        <div className="hero-foot">
          <span>Fiber {r1(totals.fiber)}g · Sugar {r1(totals.sugar)}g · Sodium {Math.round(totals.sodium)}mg</span>
          <button className="link-btn" onClick={() => { setGoalDraft(data.goals); setEditGoals(!editGoals); }}>
            {editGoals ? "Close" : "Edit goals"}
          </button>
        </div>
        {editGoals && (
          <div className="goal-grid">
            {[
              ["calories", "Calories (kcal)"],
              ["protein", "Protein (g)"],
              ["carbs", "Carbs (g)"],
              ["fat", "Fat (g)"],
              ["water", "Water (glasses)"],
            ].map(([k, label]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  value={goalDraft[k]}
                  onChange={(e) => setGoalDraft({ ...goalDraft, [k]: e.target.value })}
                />
              </label>
            ))}
            <button className="btn" onClick={saveGoals}>Save goals</button>
          </div>
        )}
      </section>

      {/* Hydration */}
      <section className="card">
        <div className="card-title-row">
          <h2>Hydration</h2>
          <span className="muted-strong">{log.water || 0} / {goals.water} glasses</span>
        </div>
        <div className="water-row">
          {Array.from({ length: Math.max(goals.water, log.water || 0) }, (_, i) => (
            <div key={i} className={`glass ${i < (log.water || 0) ? "full" : ""} ${i >= goals.water ? "extra" : ""}`}>
              <div className="glass-fill" />
            </div>
          ))}
        </div>
        <div className="water-btns">
          <button className="btn ghost" onClick={() => setWater(-1)} disabled={!log.water}>− Remove</button>
          <button className="btn" onClick={() => setWater(1)}>+ Add a glass</button>
        </div>
      </section>

      {/* Weight */}
      <section className="card">
        <div className="card-title-row">
          <h2>Weight</h2>
          <div className="weight-input">
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="—"
              value={log.weight ?? ""}
              onChange={(e) => setWeight(e.target.value)}
            />
            <span className="unit">lbs</span>
          </div>
        </div>
      </section>

      {/* Quick add */}
      <section className="card">
        <div className="card-title-row">
          <h2>Add food</h2>
          <button className="link-btn" onClick={goLibrary}>Manage library →</button>
        </div>
        <input
          className="search"
          placeholder="Search your library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {items.length === 0 ? (
          <div className="empty">
            {data.foods.length + data.recipes.length === 0
              ? "Your library is empty. Add foods and recipes in the Library tab, then log them here with one tap."
              : "No matches. Try a different search or add it in the Library tab."}
          </div>
        ) : (
          <ul className="pick-list">
            {items.map((item) => (
              <li key={item.id} className="pick-row">
                <div className="pick-info">
                  <div className="pick-name">
                    {item.name} {item.kind === "recipe" && <span className="chip">recipe</span>}
                  </div>
                  <div className="pick-sub">
                    {Math.round(n(item.calories))} kcal · P {r1(n(item.protein))} · C {r1(n(item.carbs))} · F {r1(n(item.fat))}
                    {item.serving ? ` · per ${item.serving}` : ""}
                  </div>
                </div>
                <input
                  className="servings"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={servings[item.id] ?? 1}
                  onChange={(e) => setServings({ ...servings, [item.id]: e.target.value })}
                  title="Servings"
                />
                <button className="btn small" onClick={() => addEntry(item)}>Add</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Log */}
      <section className="card">
        <div className="card-title-row">
          <h2>Logged today</h2>
          <span className="muted-strong">{log.entries.length} item{log.entries.length === 1 ? "" : "s"}</span>
        </div>
        {log.entries.length === 0 ? (
          <div className="empty">Nothing logged yet. Add something above and it will count against your goals.</div>
        ) : (
          <ul className="log-list">
            {log.entries.map((e) => (
              <li key={e.id} className="log-row">
                <div className="pick-info">
                  <div className="pick-name">
                    {e.name}
                    {n(e.servings) !== 1 && <span className="chip">×{e.servings}</span>}
                  </div>
                  <div className="pick-sub">
                    {Math.round(n(e.calories) * n(e.servings))} kcal · P {r1(n(e.protein) * n(e.servings))} · C{" "}
                    {r1(n(e.carbs) * n(e.servings))} · F {r1(n(e.fat) * n(e.servings))} {e.time ? `· ${e.time}` : ""}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => removeEntry(e.id)} title="Remove entry">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ================= LIBRARY ================= */
function LibraryView({ data, update }) {
  const [mode, setMode] = useState("foods");
  const [form, setForm] = useState(EMPTY_FOOD);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [rName, setRName] = useState("");
  const [rServing, setRServing] = useState("");
  const [rIngredients, setRIngredients] = useState([]);
  const [rEditingId, setREditingId] = useState(null);
  const [showRForm, setShowRForm] = useState(false);

  const startEdit = (f) => {
    setForm({ ...EMPTY_FOOD, ...f });
    setEditingId(f.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveFood = () => {
    if (!form.name.trim()) return;
    update((d) => {
      const item = {
        id: editingId || uid(),
        name: form.name.trim(),
        serving: form.serving.trim(),
        calories: n(form.calories),
        protein: n(form.protein),
        carbs: n(form.carbs),
        fat: n(form.fat),
        fiber: n(form.fiber),
        sugar: n(form.sugar),
        sodium: n(form.sodium),
      };
      if (editingId) {
        d.foods = d.foods.map((f) => (f.id === editingId ? item : f));
      } else {
        d.foods.push(item);
      }
      return d;
    });
    setForm(EMPTY_FOOD);
    setEditingId(null);
    setShowForm(false);
  };

  const deleteFood = (id) =>
    update((d) => {
      d.foods = d.foods.filter((f) => f.id !== id);
      return d;
    });

  const recipeTotals = (ings) =>
    ings.reduce(
      (acc, ing) => {
        const f = data.foods.find((x) => x.id === ing.foodId);
        if (!f) return acc;
        const s = n(ing.servings) || 1;
        NUTRIENT_FIELDS.forEach(([k]) => (acc[k] += n(f[k]) * s));
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
    );

  const saveRecipe = () => {
    if (!rName.trim() || rIngredients.length === 0) return;
    const t = recipeTotals(rIngredients);
    update((d) => {
      const item = {
        id: rEditingId || uid(),
        name: rName.trim(),
        serving: rServing.trim() || "1 serving",
        ingredients: rIngredients,
        calories: r1(t.calories),
        protein: r1(t.protein),
        carbs: r1(t.carbs),
        fat: r1(t.fat),
        fiber: r1(t.fiber),
        sugar: r1(t.sugar),
        sodium: r1(t.sodium),
      };
      if (rEditingId) {
        d.recipes = d.recipes.map((r) => (r.id === rEditingId ? item : r));
      } else {
        d.recipes.push(item);
      }
      return d;
    });
    setRName(""); setRServing(""); setRIngredients([]); setREditingId(null); setShowRForm(false);
  };

  const startEditRecipe = (r) => {
    setRName(r.name);
    setRServing(r.serving || "");
    setRIngredients(r.ingredients || []);
    setREditingId(r.id);
    setShowRForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRecipe = (id) =>
    update((d) => {
      d.recipes = d.recipes.filter((r) => r.id !== id);
      return d;
    });

  const rt = recipeTotals(rIngredients);

  return (
    <div className="stack">
      <div className="seg">
        <button className={`seg-btn ${mode === "foods" ? "active" : ""}`} onClick={() => setMode("foods")}>
          Foods ({data.foods.length})
        </button>
        <button className={`seg-btn ${mode === "recipes" ? "active" : ""}`} onClick={() => setMode("recipes")}>
          Recipes ({data.recipes.length})
        </button>
      </div>

      {mode === "foods" && (
        <>
          <section className="card">
            <div className="card-title-row">
              <h2>{editingId ? "Edit food" : "New food"}</h2>
              {!showForm && (
                <button className="btn small" onClick={() => { setForm(EMPTY_FOOD); setEditingId(null); setShowForm(true); }}>
                  + Add food
                </button>
              )}
            </div>
            {showForm && (
              <div className="form-grid">
                <label className="field span2">
                  <span>Name</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Greek yogurt" />
                </label>
                <label className="field span2">
                  <span>Serving size</span>
                  <input value={form.serving} onChange={(e) => setForm({ ...form, serving: e.target.value })} placeholder="1 cup (245 g)" />
                </label>
                {NUTRIENT_FIELDS.map(([k, label, unit]) => (
                  <label key={k} className="field">
                    <span>{label} ({unit})</span>
                    <input type="number" min="0" step="any" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder="0" />
                  </label>
                ))}
                <div className="form-actions span2">
                  <button className="btn ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FOOD); }}>Cancel</button>
                  <button className="btn" onClick={saveFood} disabled={!form.name.trim()}>
                    {editingId ? "Save changes" : "Add to library"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Your foods</h2>
            {data.foods.length === 0 ? (
              <div className="empty">No foods yet. Add your first item above — you'll be able to log it any day with one tap.</div>
            ) : (
              <ul className="pick-list">
                {data.foods.map((f) => (
                  <li key={f.id} className="pick-row">
                    <div className="pick-info">
                      <div className="pick-name">{f.name}</div>
                      <div className="pick-sub">
                        {Math.round(f.calories)} kcal · P {r1(f.protein)}g · C {r1(f.carbs)}g · F {r1(f.fat)}g
                        {f.fiber ? ` · Fib ${r1(f.fiber)}g` : ""}{f.sugar ? ` · Sug ${r1(f.sugar)}g` : ""}{f.sodium ? ` · Na ${Math.round(f.sodium)}mg` : ""}
                        {f.serving ? ` · per ${f.serving}` : ""}
                      </div>
                    </div>
                    <button className="link-btn" onClick={() => startEdit(f)}>Edit</button>
                    <button className="icon-btn" onClick={() => deleteFood(f.id)} title="Delete food">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {mode === "recipes" && (
        <>
          <section className="card">
            <div className="card-title-row">
              <h2>{rEditingId ? "Edit recipe" : "New recipe"}</h2>
              {!showRForm && (
                <button className="btn small" onClick={() => { setRName(""); setRServing(""); setRIngredients([]); setREditingId(null); setShowRForm(true); }}>
                  + Build recipe
                </button>
              )}
            </div>
            {showRForm && (
              <div className="stack-sm">
                <div className="form-grid">
                  <label className="field span2">
                    <span>Recipe name</span>
                    <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Chicken burrito bowl" />
                  </label>
                  <label className="field span2">
                    <span>Yields (what one log equals)</span>
                    <input value={rServing} onChange={(e) => setRServing(e.target.value)} placeholder="1 bowl" />
                  </label>
                </div>
                <div className="field">
                  <span>Add ingredients from your food library</span>
                  {data.foods.length === 0 ? (
                    <div className="empty">Add foods to your library first — recipes are built from them so macros total automatically.</div>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setRIngredients([...rIngredients, { foodId: e.target.value, servings: 1 }]);
                      }}
                    >
                      <option value="">Choose a food…</option>
                      {data.foods.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                {rIngredients.length > 0 && (
                  <ul className="pick-list">
                    {rIngredients.map((ing, i) => {
                      const f = data.foods.find((x) => x.id === ing.foodId);
                      return (
                        <li key={i} className="pick-row">
                          <div className="pick-info">
                            <div className="pick-name">{f ? f.name : "Missing food"}</div>
                            {f && <div className="pick-sub">{Math.round(f.calories * (n(ing.servings) || 1))} kcal at ×{ing.servings}</div>}
                          </div>
                          <input
                            className="servings"
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={ing.servings}
                            onChange={(e) => {
                              const copy = [...rIngredients];
                              copy[i] = { ...copy[i], servings: e.target.value };
                              setRIngredients(copy);
                            }}
                          />
                          <button className="icon-btn" onClick={() => setRIngredients(rIngredients.filter((_, j) => j !== i))}>✕</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {rIngredients.length > 0 && (
                  <div className="recipe-total">
                    Totals: <b>{Math.round(rt.calories)} kcal</b> · P {r1(rt.protein)}g · C {r1(rt.carbs)}g · F {r1(rt.fat)}g · Fib {r1(rt.fiber)}g · Sug {r1(rt.sugar)}g · Na {Math.round(rt.sodium)}mg
                  </div>
                )}
                <div className="form-actions">
                  <button className="btn ghost" onClick={() => { setShowRForm(false); setREditingId(null); }}>Cancel</button>
                  <button className="btn" onClick={saveRecipe} disabled={!rName.trim() || rIngredients.length === 0}>
                    {rEditingId ? "Save changes" : "Save recipe"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Your recipes</h2>
            {data.recipes.length === 0 ? (
              <div className="empty">No recipes yet. Build one from your foods and log the whole thing in one tap.</div>
            ) : (
              <ul className="pick-list">
                {data.recipes.map((r) => (
                  <li key={r.id} className="pick-row">
                    <div className="pick-info">
                      <div className="pick-name">{r.name} <span className="chip">{(r.ingredients || []).length} ingredients</span></div>
                      <div className="pick-sub">
                        {Math.round(r.calories)} kcal · P {r1(r.protein)}g · C {r1(r.carbs)}g · F {r1(r.fat)}g · per {r.serving}
                      </div>
                    </div>
                    <button className="link-btn" onClick={() => startEditRecipe(r)}>Edit</button>
                    <button className="icon-btn" onClick={() => deleteRecipe(r.id)} title="Delete recipe">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ================= WEEK ================= */
function WeekView({ data, date, setDate, goToday, update }) {
  const [anchor, setAnchor] = useState(date);
  const days = weekDates(anchor);
  const goals = data.goals;
  const tk = todayKey();

  const shift = (delta) => {
    const d = new Date(anchor + "T12:00:00");
    d.setDate(d.getDate() + delta * 7);
    setAnchor(todayKey(d));
  };

  const dayTotals = (key) => {
    const log = data.logs[key];
    if (!log) return { cal: 0, water: 0, weight: "", count: 0 };
    const cal = (log.entries || []).reduce((s, e) => s + n(e.calories) * n(e.servings || 1), 0);
    return { cal, water: log.water || 0, weight: log.weight, count: (log.entries || []).length };
  };

  const weights = days.map((k) => n(dayTotals(k).weight)).filter((w) => w > 0);
  const avgCal = Math.round(days.reduce((s, k) => s + dayTotals(k).cal, 0) / 7);

  const setWeightFor = (key, v) =>
    update((d) => {
      const dayLog = d.logs[key] || { entries: [], water: 0, weight: "" };
      dayLog.weight = v;
      d.logs[key] = dayLog;
      return d;
    });

  const range = `${new Date(days[0] + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(days[6] + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title-row">
          <button className="icon-btn nav" onClick={() => shift(-1)} title="Previous week">‹</button>
          <h2 className="center-title">{range}</h2>
          <button className="icon-btn nav" onClick={() => shift(1)} title="Next week">›</button>
        </div>

        <div className="week-grid">
          {days.map((k) => {
            const t = dayTotals(k);
            const pct = goals.calories > 0 ? Math.min(1, t.cal / goals.calories) : 0;
            const over = t.cal > goals.calories;
            return (
              <button
                key={k}
                className={`day-cell ${k === tk ? "is-today" : ""} ${k === date ? "is-selected" : ""}`}
                onClick={() => { setDate(k); goToday(); }}
                title="Open this day"
              >
                <div className="day-name">{dayLabel(k)}</div>
                <div className="day-num">{dayNum(k)}</div>
                <div className="day-bar">
                  <div className="day-bar-fill" style={{ height: `${pct * 100}%`, background: over ? "var(--over)" : "var(--primary)" }} />
                </div>
                <div className="day-cal">{t.count ? Math.round(t.cal) : "—"}</div>
                <div className="day-drops">
                  {t.water > 0 ? `💧${t.water}` : ""}
                </div>
              </button>
            );
          })}
        </div>
        <div className="week-foot">
          Tap a day to view or edit it · Bar = calories vs your {goals.calories} kcal goal · Week average: <b>{avgCal} kcal/day</b>
        </div>
      </section>

      <section className="card">
        <h2>Weight this week</h2>
        {weights.length >= 2 && (
          <div className="weight-summary">
            {weights[weights.length - 1] < weights[0] ? "Down" : weights[weights.length - 1] > weights[0] ? "Up" : "Steady at"}{" "}
            <b>{r1(Math.abs(weights[weights.length - 1] - weights[0]))} lbs</b> across logged days
          </div>
        )}
        <ul className="weight-list">
          {days.map((k) => {
            const t = dayTotals(k);
            return (
              <li key={k} className="weight-row">
                <span className="weight-day">{dayLabel(k)} {dayNum(k)}</span>
                <div className="weight-input">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="—"
                    value={t.weight ?? ""}
                    onChange={(e) => setWeightFor(k, e.target.value)}
                  />
                  <span className="unit">lbs</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ================= styles ================= */
function Style() {
  return (
    <style>{`
      :root {
        --ink: #16324A;
        --ink-soft: #4A6A85;
        --primary: #2F6FA7;
        --primary-deep: #245A8A;
        --wash: #EAF2F9;
        --card: #FFFFFF;
        --line: #D4E3F0;
        --ring-track: #DCE9F4;
        --over: #C2664A;
        --fill-soft: #F3F8FC;
      }
      * { box-sizing: border-box; }
      .app {
        min-height: 100vh;
        background: linear-gradient(180deg, var(--wash) 0%, #F6FAFD 240px);
        color: var(--ink);
        font-family: ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        max-width: 760px;
        margin: 0 auto;
        padding: 20px 16px 60px;
      }
      .loading { padding: 60px 0; text-align: center; font-weight: 700; color: var(--ink-soft); }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .app-name { font-size: 30px; font-weight: 900; letter-spacing: -0.5px; color: var(--primary-deep); }
      .app-sub { font-size: 13px; font-weight: 700; color: var(--ink-soft); margin-top: -2px; }
      .date-pick {
        border: 2px solid var(--line); border-radius: 12px; padding: 8px 10px;
        font: inherit; font-weight: 800; color: var(--primary-deep); background: var(--card);
      }
      .tabs { display: flex; gap: 8px; background: #DDEAF5; padding: 5px; border-radius: 14px; margin-bottom: 16px; }
      .tab {
        flex: 1; border: none; background: transparent; padding: 10px 0; border-radius: 10px;
        font: inherit; font-weight: 800; font-size: 15px; color: var(--ink-soft); cursor: pointer;
      }
      .tab.active { background: var(--card); color: var(--primary-deep); box-shadow: 0 2px 6px rgba(36,90,138,0.15); }
      .tab:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
        outline: 3px solid #8FBEE3; outline-offset: 1px;
      }
      .status { background: #FBEFE9; color: var(--over); font-weight: 700; padding: 10px 14px; border-radius: 12px; margin-bottom: 12px; }
      .stack { display: flex; flex-direction: column; gap: 14px; }
      .stack-sm { display: flex; flex-direction: column; gap: 12px; }
      .date-line { font-weight: 800; color: var(--ink-soft); font-size: 15px; padding-left: 4px; }
      .card {
        background: var(--card); border: 1.5px solid var(--line); border-radius: 18px;
        padding: 18px; box-shadow: 0 3px 14px rgba(36,90,138,0.06);
      }
      h2 { margin: 0 0 10px; font-size: 18px; font-weight: 900; letter-spacing: -0.2px; }
      .card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .card-title-row h2 { margin-bottom: 10px; }
      .center-title { flex: 1; text-align: center; }
      .muted-strong { font-weight: 800; color: var(--ink-soft); font-size: 14px; }

      .hero { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; justify-content: center; }
      .macros { flex: 1; min-width: 230px; display: flex; flex-direction: column; gap: 12px; }
      .ring-num { font-size: 40px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
      .ring-sub { font-size: 14px; font-weight: 800; color: var(--ink-soft); margin-top: 2px; }
      .ring-tiny { font-size: 11px; font-weight: 700; color: var(--ink-soft); margin-top: 4px; }
      .hero-foot {
        display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
        margin-top: 14px; padding-top: 12px; border-top: 1.5px solid var(--line);
        font-size: 13px; font-weight: 700; color: var(--ink-soft);
      }
      .over-text { color: var(--over); }

      .macro-top { display: flex; justify-content: space-between; font-size: 14px; }
      .macro-label { font-weight: 900; }
      .macro-left { font-weight: 700; color: var(--ink-soft); }
      .macro-left b { color: var(--ink); }
      .bar { height: 10px; background: var(--ring-track); border-radius: 6px; overflow: hidden; margin-top: 5px; }
      .bar-fill { height: 100%; border-radius: 6px; transition: width .4s ease; }
      .macro-sub { font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-top: 3px; }

      .water-row { display: flex; gap: 7px; flex-wrap: wrap; margin: 6px 0 14px; }
      .glass {
        width: 30px; height: 42px; border: 2.5px solid var(--primary); border-top-width: 1.5px;
        border-radius: 4px 4px 9px 9px; position: relative; overflow: hidden; background: var(--fill-soft);
      }
      .glass.extra { border-style: dashed; }
      .glass-fill {
        position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
        background: linear-gradient(180deg, #7FB6DE, var(--primary)); transition: height .35s ease;
      }
      .glass.full .glass-fill { height: 88%; }
      .water-btns { display: flex; gap: 10px; }

      .btn {
        border: none; background: var(--primary); color: #fff; font: inherit; font-weight: 800;
        padding: 11px 18px; border-radius: 12px; cursor: pointer; font-size: 15px;
      }
      .btn:hover { background: var(--primary-deep); }
      .btn:disabled { opacity: .45; cursor: default; }
      .btn.small { padding: 8px 14px; font-size: 14px; }
      .btn.ghost { background: var(--fill-soft); color: var(--primary-deep); border: 1.5px solid var(--line); }
      .btn.ghost:hover { background: #E7F0F8; }
      .link-btn {
        border: none; background: none; color: var(--primary); font: inherit; font-weight: 800;
        cursor: pointer; padding: 4px; font-size: 14px;
      }
      .icon-btn {
        border: none; background: var(--fill-soft); color: var(--ink-soft); font-weight: 800;
        width: 32px; height: 32px; border-radius: 9px; cursor: pointer; flex-shrink: 0; font-size: 14px;
      }
      .icon-btn:hover { background: #E7F0F8; color: var(--over); }
      .icon-btn.nav { font-size: 20px; color: var(--primary-deep); }
      .icon-btn.nav:hover { color: var(--primary-deep); }

      .search, .field input, .field select {
        width: 100%; border: 2px solid var(--line); border-radius: 12px; padding: 11px 12px;
        font: inherit; font-weight: 700; color: var(--ink); background: var(--card);
      }
      .search { margin-bottom: 12px; }
      .search::placeholder, .field input::placeholder { color: #9AB4C9; font-weight: 600; }
      .field { display: flex; flex-direction: column; gap: 5px; }
      .field > span { font-size: 12.5px; font-weight: 800; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .4px; }

      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }
      .span2 { grid-column: span 2; }
      .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .goal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; align-items: end; }

      .pick-list, .log-list, .weight-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .pick-row, .log-row {
        display: flex; align-items: center; gap: 10px; padding: 11px 2px;
        border-top: 1.5px solid var(--line);
      }
      .pick-list li:first-child, .log-list li:first-child { border-top: none; }
      .pick-info { flex: 1; min-width: 0; }
      .pick-name { font-weight: 800; font-size: 15px; }
      .pick-sub { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); margin-top: 2px; }
      .chip {
        display: inline-block; background: var(--wash); color: var(--primary-deep);
        font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 20px; margin-left: 6px; vertical-align: 1px;
      }
      .servings { width: 62px; border: 2px solid var(--line); border-radius: 10px; padding: 8px 6px; font: inherit; font-weight: 800; text-align: center; }
      .empty { background: var(--fill-soft); border-radius: 12px; padding: 16px; font-weight: 700; color: var(--ink-soft); font-size: 14px; line-height: 1.45; }
      .recipe-total { background: var(--wash); border-radius: 12px; padding: 12px 14px; font-weight: 700; font-size: 14px; }

      .week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 6px; }
      .day-cell {
        border: 2px solid var(--line); background: var(--card); border-radius: 14px;
        padding: 8px 4px 7px; cursor: pointer; font: inherit; display: flex; flex-direction: column; align-items: center; gap: 4px;
      }
      .day-cell:hover { border-color: var(--primary); }
      .day-cell.is-today { border-color: var(--primary); background: var(--fill-soft); }
      .day-cell.is-selected { box-shadow: 0 0 0 3px rgba(47,111,167,.25); }
      .day-name { font-size: 11px; font-weight: 800; color: var(--ink-soft); text-transform: uppercase; }
      .day-num { font-size: 17px; font-weight: 900; }
      .day-bar { width: 12px; height: 44px; background: var(--ring-track); border-radius: 7px; display: flex; align-items: flex-end; overflow: hidden; }
      .day-bar-fill { width: 100%; border-radius: 7px; transition: height .4s ease; }
      .day-cal { font-size: 12px; font-weight: 800; }
      .day-drops { font-size: 10.5px; font-weight: 700; min-height: 14px; }
      .week-foot { margin-top: 12px; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); line-height: 1.5; }

      .weight-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 2px; border-top: 1.5px solid var(--line); }
      .weight-list li:first-child { border-top: none; }
      .weight-day { font-weight: 800; }
      .weight-input { display: flex; align-items: center; gap: 6px; }
      .weight-input input { width: 92px; border: 2px solid var(--line); border-radius: 10px; padding: 8px; font: inherit; font-weight: 800; text-align: right; }
      .unit { font-weight: 800; color: var(--ink-soft); font-size: 13px; }
      .weight-summary { background: var(--wash); border-radius: 12px; padding: 10px 14px; font-weight: 700; margin-bottom: 10px; font-size: 14px; }

      .seg { display: flex; gap: 4px; background: #DDEAF5; padding: 4px; border-radius: 12px; margin-bottom: 12px; }
      .seg-btn { flex: 1; border: none; background: transparent; padding: 10px 0; border-radius: 10px; font: inherit; font-weight: 800; font-size: 15px; color: var(--ink-soft); cursor: pointer; }
      .seg-btn.active { background: var(--card); color: var(--primary-deep); box-shadow: 0 2px 6px rgba(36,90,138,0.15); }

      @media (max-width: 480px) {
        .form-grid, .goal-grid { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .app-name { font-size: 24px; }
        .day-bar { height: 34px; }
        .glass { width: 26px; height: 37px; }
      }
      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
      }
    `}</style>
  );
}
