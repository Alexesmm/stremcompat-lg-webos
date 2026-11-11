# The small native part: starts nodejs-mobile's Node with the local server.
cmake_minimum_required(VERSION 3.22.1)
project(stremcompat)
add_library(native-lib SHARED native-lib.cpp)
target_include_directories(native-lib PRIVATE ${NODE_DIR}/include/node)
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${NODE_DIR}/bin/${ANDROID_ABI}/libnode.so)
find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})
