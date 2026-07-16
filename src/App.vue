<template>
  <!-- 路由视图出口：匹配到的页面会根据网址自动在这里播放 -->
  <router-view />
</template>

<style>
/* 这里放一点全屏的基础复位样式，确保页面不会缩在角落里 */
body {
  margin: 0;
  background-color: #f7f9fa;
}
</style>