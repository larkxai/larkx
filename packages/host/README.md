# @larkxai/host

Host driver for the shared C++ runtime. This package is private. `larkx_run_drive` decides the next action. This package calls the model or tool the core requested and submits the result. It does not plan steps, and it does not open a database by itself.

Node and React Native each supply a transport. Application code imports `@larkxai/node` or `@larkxai/react-native`. Those packages bundle this driver.
