<script setup lang="ts">
import { useRoute } from 'vue-router';
import { openSearch } from '../lib/search';

const route = useRoute();
const guess = (route.params.pathMatch as string[] | undefined)?.join(' ').replace(/INPUT_|\.html?$/gi, '') ?? '';
</script>

<template>
  <div class="page no-toc">
    <div class="reader">
      <h1 class="doc-title">Page not found</h1>
      <p>There is no page at <code>{{ route.fullPath }}</code>.</p>
      <p>
        <button class="btn btn-primary" type="button" @click="openSearch(guess)">Search for “{{ guess || '…' }}”</button>
        <RouterLink class="btn" to="/" style="margin-left: 8px">Go to the overview</RouterLink>
      </p>
    </div>
  </div>
</template>
