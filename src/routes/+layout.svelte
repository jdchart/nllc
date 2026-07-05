<script>
	import favicon from '$lib/assets/favicon.svg';
	import './reset.css';
	import './theme.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
