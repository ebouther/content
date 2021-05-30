<template>
  <div :class="['nuxt-content-container', { 'is-editing': isEditing }]">
    <label for="author">author: </label>
    <input
      id="author"
      v-model="author"
      type="text"
      name="name"
      value="admin"
    >
    <br/>
    <br/>
    <editor
      v-show="isEditing"
      v-model="file"
      :is-editing="isEditing"
      class="nuxt-content-editor"
      @endEdit="toggleEdit"
    />
    <nuxt-content-dev
      v-show="!isEditing"
      :id="id"
      ref="content"
      :class="classes"
      :document="document"
      @dblclick="toggleEdit"
    />
    <br/>
    <button v-on:click="saveFile">Save</button>
  </div>
</template>

<script>
import github from './github'
import NuxtContent from './nuxt-content'
import Editor from '<%= options.editor %>'

export default {
  name: 'NuxtContent',
  components: {
    NuxtContentDev: NuxtContent,
    Editor
  },
  props: NuxtContent.props,
  data () {
    return {
      classes: [],
      isEditing: false,
      file: null,
      author: null,
      id: null
    }
  },
  computed: {
    fileUrl () {
      return `/<%= options.apiPrefix %>${this.document.path}${this.document.extension}`
    },
    filePath () {
      return `content${this.document.path}${this.document.extension}`
    }
  },
  mounted () {
    if (this.$vnode.data.attrs && this.$vnode.data.attrs.id) {
      this.id = this.$vnode.data.attrs.id
    }
    if (this.$vnode.data.class) {
      let classes
      if (Array.isArray(this.$vnode.data.class)) {
        classes = this.$vnode.data.class
      } else if (typeof this.$vnode.data.class === 'object') {
        const keys = Object.keys(this.$vnode.data.class)
        classes = keys.filter(key => this.$vnode.data.class[key])
      } else {
        classes = this.$vnode.data.class
      }
      this.classes = this.classes.concat(classes)
      delete this.$vnode.data.class
    }

    if (this.$vnode.data.staticClass) {
      this.classes = this.classes.concat(this.$vnode.data.staticClass)
      delete this.$vnode.data.staticClass
    }
  },
  methods: {
    async toggleEdit () {
      if (this.isEditing) {
        await this.updateFile()
        this.isEditing = false
        return
      }
      // Fetch file content
      await this.fetchFile()
      // Start editing mode
      this.isEditing = true
    },
    async fetchFile () {
      console.log('FETCH FILE', this.filePath, this.file)

      ;({ editBranch: this.editBranch, content: this.file }  = await github.fetchFile({filePath: this.filePath, author: this.author}))

      console.log('EDIT BRANCH : ', this.editBranch)
    },
    async updateFile() {
      this.ongoingUpdate = true
      console.log('UPDATE FILE', this.document.path, this.document.extension)

      ;({ editBranch: this.editBranch } = await github.updateFile({
        filePath: this.filePath,
        content: this.file,
        author: this.author,
        editBranch: this.editBranch
      }))

      console.log('EDIT BRANCH : ', this.editBranch)

      this.ongoingUpdate = false;
    },
    async saveFile () {

      if (this.ongoingUpdate) {
        console.warn('Wait for file update to be done.')
        return;
      }

      console.log('SAVE FILE', this.filePath)
      await github.saveFile({ filePath: this.filePath, editBranch: this.editBranch })
    },
    waitFor (ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    }
  }
}
</script>

<style scoped>
.nuxt-content-container {
  position: relative;
}

.nuxt-content-editor {
  width: 100%;
  padding: 8px;
}
</style>
