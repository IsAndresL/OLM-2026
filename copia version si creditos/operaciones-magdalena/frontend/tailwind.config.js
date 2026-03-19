export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#0178C2',
          light: '#01AAED',
          dark: '#074D93',
          pink: '#FC15A7',
          navy: '#192A3D',
          whatsapp: '#25D366',
        }
      },
      fontFamily: {
        title: ['Montserrat', 'sans-serif'],
        subtitle: ['Poppins', 'sans-serif'],
        body: ['Open Sans', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
