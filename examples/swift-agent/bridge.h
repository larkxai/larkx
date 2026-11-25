#include "larkx.h"

static inline int larkx_example_ok(larkx_code code) { return code == LARKX_OK; }

static inline int32_t larkx_example_kind_model(void) { return LARKX_REQUEST_INVOKE_MODEL; }

static inline int32_t larkx_example_kind_tool(void) { return LARKX_REQUEST_INVOKE_TOOL; }

static inline int32_t larkx_example_kind_complete(void) { return LARKX_REQUEST_COMPLETE; }
