<template>
  <div class="recorder">
    <button @click="toggleRecording">
      {{ isRecording ? "停止录音" : "开始录音" }}
    </button>

    <div v-if="audioUrl">
      <h3>录音回放：</h3>
      <audio :src="audioUrl" controls></audio>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const isRecording = ref(false);
const mediaRecorder = ref(null);
const audioChunks = ref([]);
const audioUrl = ref("");

const toggleRecording = async () => {
  if (!isRecording.value) {
    // 开始录音
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,   // AEC 启用
        noiseSuppression: true,   // 降噪
        autoGainControl: true     // 自动增益
      }
    });

    mediaRecorder.value = new MediaRecorder(stream);
    audioChunks.value = [];

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data);
      }
    };

    mediaRecorder.value.onstop = () => {
      const blob = new Blob(audioChunks.value, { type: "audio/webm" });
      audioUrl.value = URL.createObjectURL(blob);
    };

    mediaRecorder.value.start();
    isRecording.value = true;
  } else {
    // 停止录音
    mediaRecorder.value.stop();
    isRecording.value = false;
  }
};
</script>

<style scoped>
.recorder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
button {
  padding: 8px 16px;
  cursor: pointer;
}
</style>
