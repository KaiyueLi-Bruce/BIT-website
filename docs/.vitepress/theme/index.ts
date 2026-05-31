import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import './custom.css'
import ISODemo from './components/demos/ISODemo.vue'
import ShutterDemo from './components/demos/ShutterDemo.vue'
import ApertureDemo from './components/demos/ApertureDemo.vue'

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app }: { app: any }) {
    app.component('ISODemo', ISODemo)
    app.component('ShutterDemo', ShutterDemo)
    app.component('ApertureDemo', ApertureDemo)
  },
}
