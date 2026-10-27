const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("typescript");
module.exports = function cargar(archivo, mocks = {}, cache = new Map()) {
  const ruta = path.resolve(__dirname, "..", archivo),
    real = createRequire(ruta);
  if (cache.has(ruta)) return cache.get(ruta).exports;
  const module = { exports: {} };
  cache.set(ruta, module);
  const code = ts.transpileModule(fs.readFileSync(ruta, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const req = (nombre) => {
    if (Object.hasOwn(mocks, nombre)) return mocks[nombre];
    if (nombre === "server-only") return {};
    if (nombre.startsWith(".") || nombre.startsWith("@/")) {
      const base = nombre.startsWith("@/")
        ? path.resolve(__dirname, "..", nombre.slice(2))
        : path.resolve(path.dirname(ruta), nombre);
      const destino = [
        base,
        base + ".ts",
        base + ".tsx",
        base + ".js",
        base + ".cjs",
      ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (destino && /\.tsx?$/.test(destino))
        return cargar(
          path.relative(path.resolve(__dirname, ".."), destino),
          mocks,
          cache,
        );
    }
    return real(nombre);
  };
  new Function("require", "module", "exports", code)(
    req,
    module,
    module.exports,
  );
  return module.exports;
};
