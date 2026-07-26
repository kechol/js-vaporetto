/* @ts-self-types="./js_vaporetto.d.ts" */
import * as wasm from "./js_vaporetto_bg.wasm";
import { __wbg_set_wasm } from "./js_vaporetto_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    Vaporetto
} from "./js_vaporetto_bg.js";
