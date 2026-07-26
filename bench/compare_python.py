"""Compare js-vaporetto against the official python-vaporetto on identical input.

Both wrap the same vaporetto 0.6.5 core, so this measures the cost of the
binding layer, not of the tokenizer.
"""
import json, pathlib, sys, time
import vaporetto

model_path, corpus_path, limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
model = pathlib.Path(model_path).read_bytes()
texts = [l for l in pathlib.Path(corpus_path).read_text(encoding="utf-8").splitlines() if l.strip()][:limit]
chars = sum(len(t) for t in texts)


def best(fn, runs=3):
    return min((lambda t0: (fn(), time.perf_counter() - t0)[1])(time.perf_counter()) for _ in range(runs))


loads = []
for _ in range(5):
    t0 = time.perf_counter()
    vaporetto.Vaporetto(model, predict_tags=False)
    loads.append(time.perf_counter() - t0)

tk = vaporetto.Vaporetto(model, predict_tags=False)
tagging = vaporetto.Vaporetto(model, predict_tags=True)
for t in texts[:200]:
    tk.tokenize(t)


def tokenize_all():
    # js-vaporetto returns fully materialized plain objects, so pull the same
    # fields out here. python-vaporetto's TokenList is lazy: iterating it alone
    # would measure far less work.
    for t in texts:
        for tok in tk.tokenize(t):
            tok.surface(), tok.start(), tok.end()


def to_string_all():
    for t in texts:
        tk.tokenize_to_string(t)


def tagged_all():
    for t in texts:
        for tok in tagging.tokenize(t):
            tok.surface(), tok.start(), tok.end(), tok.tag(0), tok.tag(1)


print(json.dumps({
    "impl": f"python-vaporetto {vaporetto.VAPORETTO_VERSION}",
    "lines": len(texts),
    "chars": chars,
    "loadMs": round(min(loads) * 1000, 2),
    "perCallMs": round(best(tokenize_all) * 1000, 2),
    "toStringMs": round(best(to_string_all) * 1000, 2),
    "taggedPerCallMs": round(best(tagged_all) * 1000, 2),
}))
