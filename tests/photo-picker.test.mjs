import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/photo-picker.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}}).outputText;

// Exercise the component's real input props and handlers, with only useRef
// substituted for DOM refs. Native phone camera UI still needs a device test.
function setup(overrides = {}) {
  const exports = {};
  const calls = [];
  runInNewContext(compiled, {exports, require: id => id === 'react'
    ? {...require('react'), useRef: () => ({current: null})}
    : require(id)});
  const tree = exports.default({disabled: false, multiple: true,
    onChoose: files => calls.push(Array.from(files)), ...overrides});
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  const inputs = nodes.filter(node => node.type === 'input');
  const buttons = nodes.filter(node => node.type === 'button');
  return {inputs, buttons, calls};
}

function change(input, files) {
  const target = {files, value: 'camera-photo.jpg'};
  input.props.onChange({currentTarget: target});
  assert.equal(target.value, '', 'input resets for repeated photo selection');
}

test('camera requests a single rear-camera image; gallery retains batch upload', () => {
  const {inputs: [gallery, camera], buttons} = setup();
  assert.equal(gallery.props.multiple, true);
  assert.equal(gallery.props.capture, undefined);
  assert.equal(camera.props.accept, 'image/*');
  assert.equal(camera.props.capture, 'environment');
  assert.equal(camera.props.multiple, undefined);
  let galleryClicks = 0, cameraClicks = 0;
  gallery.props.ref.current = {click: () => galleryClicks++};
  camera.props.ref.current = {click: () => cameraClicks++};
  buttons[0].props.onClick(); // Preview selects saved photos.
  buttons[1].props.onClick(); // Upload photos.
  buttons[2].props.onClick(); // Take a photo.
  assert.equal(galleryClicks, 2);
  assert.equal(cameraClicks, 1);
});

test('gallery sends a batch, camera sends one, and either can select the same file again', () => {
  const {inputs: [gallery, camera], calls} = setup();
  const first = {name: 'photo.jpg'}, second = {name: 'other.jpg'};
  change(gallery, [first, second]);
  change(camera, [first, second]);
  change(camera, [first]);
  assert.deepEqual(calls, [[first, second], [first], [first]]);
});

test('cancelling either picker does not replace the current photo or batch', () => {
  const {inputs, calls} = setup();
  for (const input of inputs) {change(input, []); change(input, null);}
  assert.deepEqual(calls, []);
});

test('purchase input permits only one saved photo', () => {
  const {inputs: [gallery], calls} = setup({multiple: false});
  assert.equal(gallery.props.multiple, false);
  const first = {name: 'one.jpg'};
  change(gallery, [first, {name: 'two.jpg'}]);
  assert.deepEqual(calls, [[first]]);
});

test('processing or saving disables both inputs and all photo buttons', () => {
  const {inputs, buttons, calls} = setup({disabled: true});
  for (const node of [...inputs, ...buttons]) assert.equal(node.props.disabled, true);
  for (const input of inputs) change(input, [{name: 'photo.jpg'}]);
  assert.deepEqual(calls, []);
});
