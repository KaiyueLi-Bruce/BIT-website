<template>
  <DefaultTheme.Layout>
    <template v-if="frontmatter.bit3d" #home-hero-before>
      <BitHome />
    </template>
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData" />
    </template>
  </DefaultTheme.Layout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import BitHome from './components/BitHome.vue'

const { frontmatter } = useData()
</script>
