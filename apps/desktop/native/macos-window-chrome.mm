#include <node_api.h>

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

namespace {

char kFelixWindowChromeControllerKey;

void ThrowTypeError(napi_env env, const char *message) {
  napi_throw_type_error(env, nullptr, message);
}

void ThrowError(napi_env env, const char *message) {
  napi_throw_error(env, nullptr, message);
}

bool ReadPointerFromBuffer(napi_env env, napi_value value, uintptr_t *out) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) return false;

  void *data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok) return false;
  if (length < sizeof(uintptr_t)) return false;

  uintptr_t pointer = 0;
  memcpy(&pointer, data, sizeof(pointer));
  *out = pointer;
  return true;
}

NSWindow *WindowFromHandle(uintptr_t handle) {
  if (handle == 0) return nil;

  id object = (__bridge id)(reinterpret_cast<void *>(handle));
  if ([object isKindOfClass:[NSWindow class]]) return static_cast<NSWindow *>(object);
  if ([object respondsToSelector:@selector(window)]) return [object window];
  return nil;
}

NSToolbar *CreateToolbar() {
  NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:@"FelixUnifiedToolbar"];
  toolbar.displayMode = NSToolbarDisplayModeIconOnly;
  toolbar.allowsUserCustomization = NO;
  toolbar.autosavesConfiguration = NO;
  toolbar.showsBaselineSeparator = NO;
  if (@available(macOS 15.0, *)) {
    toolbar.allowsDisplayModeCustomization = NO;
  }
  return toolbar;
}

}  // namespace

@interface FelixWindowChromeController : NSObject
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic, strong) NSToolbar *toolbar;
- (instancetype)initWithWindow:(NSWindow *)window;
- (void)apply;
@end

@implementation FelixWindowChromeController

- (instancetype)initWithWindow:(NSWindow *)window {
  self = [super init];
  if (!self) return nil;

  _window = window;
  _toolbar = CreateToolbar();

  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  [center addObserver:self
             selector:@selector(windowWillEnterFullScreen:)
                 name:NSWindowWillEnterFullScreenNotification
               object:window];
  [center addObserver:self
             selector:@selector(windowWillExitFullScreen:)
                 name:NSWindowWillExitFullScreenNotification
               object:window];
  [center addObserver:self
             selector:@selector(windowDidExitFullScreen:)
                 name:NSWindowDidExitFullScreenNotification
               object:window];

  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)apply {
  NSWindow *window = self.window;
  if (!window) return;

  window.titlebarAppearsTransparent = YES;
  window.titleVisibility = NSWindowTitleHidden;
  window.styleMask = window.styleMask | NSWindowStyleMaskFullSizeContentView;
  if ([window respondsToSelector:@selector(setToolbarStyle:)]) {
    window.toolbarStyle = NSWindowToolbarStyleUnified;
  }

  if ((window.styleMask & NSWindowStyleMaskFullScreen) == 0 && window.toolbar != self.toolbar) {
    window.toolbar = self.toolbar;
  }
}

- (void)windowWillEnterFullScreen:(NSNotification *)notification {
  self.window.toolbar = nil;
}

- (void)windowWillExitFullScreen:(NSNotification *)notification {
  [self apply];
}

- (void)windowDidExitFullScreen:(NSNotification *)notification {
  [self apply];
}

@end

namespace {

napi_value ConfigureUnifiedToolbar(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok) {
    ThrowError(env, "Could not read arguments.");
    return nullptr;
  }
  if (argc < 1) {
    ThrowTypeError(env, "Expected an Electron native window handle buffer.");
    return nullptr;
  }

  uintptr_t handle = 0;
  if (!ReadPointerFromBuffer(env, args[0], &handle)) {
    ThrowTypeError(env, "Expected an Electron native window handle buffer.");
    return nullptr;
  }

  __block NSWindow *window = nil;
  __block bool didRun = false;

  void (^configureWindow)(void) = ^{
    @autoreleasepool {
      window = WindowFromHandle(handle);
      if (!window) return;

      FelixWindowChromeController *controller =
          objc_getAssociatedObject(window, &kFelixWindowChromeControllerKey);
      if (!controller) {
        controller = [[FelixWindowChromeController alloc] initWithWindow:window];
        objc_setAssociatedObject(window, &kFelixWindowChromeControllerKey, controller,
                                 OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      }
      [controller apply];
      didRun = true;
    }
  };

  if ([NSThread isMainThread]) {
    configureWindow();
  } else {
    dispatch_sync(dispatch_get_main_queue(), configureWindow);
  }

  if (!didRun || !window) {
    ThrowError(env, "Could not resolve an NSWindow from the Electron native handle.");
    return nullptr;
  }

  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"configureUnifiedToolbar", nullptr, ConfigureUnifiedToolbar, nullptr, nullptr, nullptr,
       napi_default, nullptr},
  };
  napi_define_properties(env, exports, 1, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
