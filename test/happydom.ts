import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// happy-dom 20.12 added the Web Animations API, so `Element.getAnimations`
// now exists. When it does, Base UI defers unmounting a closed popup or an
// inactive tab panel by a frame plus its animations' promises, instead of
// unmounting in the same commit as it does without the API -- so an assertion
// that runs right after a click still finds the old subtree (#1846). Stubbing
// `getAnimations` to return [] doesn't help: the function still exists, so the
// deferred path still runs. This is Base UI's own switch for test
// environments, and it restores the synchronous unmount.
declare global {
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
