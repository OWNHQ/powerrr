<script setup lang="ts">
defineProps<{ decorative?: boolean }>();
</script>

<template>
  <span
    class="own-logo block w-full text-own"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : 'OWN'"
    :aria-hidden="decorative ? 'true' : undefined"
  ></span>
</template>

<style scoped>
.own-logo {
  aspect-ratio: 515 / 172;
  background-color: currentColor;
  mask: url("/brands/own.svg") center / contain no-repeat;
  -webkit-mask: url("/brands/own.svg") center / contain no-repeat;
}
</style>
