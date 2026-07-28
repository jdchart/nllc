<script>
    import SessionPage from "$lib/components/code-editor/SessionPage.svelte";

    let { data } = $props();
</script>

<SessionPage
    sessionUrl="/sessions/{data.slug}.json"
    title="NLLC // {data.slug}"
/>
