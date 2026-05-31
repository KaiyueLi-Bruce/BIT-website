<template>
  <DefaultTheme.Layout>
    <template v-if="frontmatter.bit3d" #home-hero-before>
      <BitHome />
    </template>
    <template #layout-bottom>
      <SiteFooter v-if="!frontmatter.bit3d" />
    </template>
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData" />
    </template>
  </DefaultTheme.Layout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { provide, nextTick } from 'vue'
import BitHome from './components/BitHome.vue'
import SiteFooter from './components/SiteFooter.vue'

const { frontmatter, isDark } = useData()

// Animated day ⇄ night toggle: a circular reveal expanding from the switch.
// Falls back to an instant toggle when the View Transitions API is unavailable
// or the user prefers reduced motion.
const enableTransitions = () =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches

provide('toggle-appearance', async ({ clientX: x, clientY: y }: MouseEvent) => {
  if (!enableTransitions()) {
    isDark.value = !isDark.value
    return
  }

  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )

  await (document as any).startViewTransition(async () => {
    isDark.value = !isDark.value
    await nextTick()
  }).ready

  // Always grow the *incoming* theme as a circle on top of the outgoing one.
  // It fully covers the viewport before the snapshot is removed, so the handoff
  // to the live DOM is seamless — no end-of-transition flash.
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 420,
      easing: 'ease-out',
      pseudoElement: '::view-transition-new(root)',
    },
  )
})
</script>
