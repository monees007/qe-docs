<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

import { watch } from 'vue';

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({ immediate: true });
watch(offlineReady, (v) => {
  if (v) setTimeout(() => (offlineReady.value = false), 5000);
});
function dismiss() {
  needRefresh.value = false;
  offlineReady.value = false;
}
</script>

<template>
  <div v-if="needRefresh" class="toast" role="alert">
    <span>A newer version of the reader is available.</span>
    <button class="btn btn-primary" type="button" @click="updateServiceWorker(true)">Reload</button>
    <button class="btn" type="button" @click="dismiss">Later</button>
  </div>
  <div v-else-if="offlineReady" class="toast" role="status">
    <span>Ready to work offline.</span>
    <button class="btn" type="button" @click="dismiss">OK</button>
  </div>
</template>
