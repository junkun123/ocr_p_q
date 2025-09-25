import React from 'react';
import './Profile.css'; // Crearemos este archivo para los estilos

const Profile = () => (
    <div className="profile-container">
        <h1>👋 Hola, soy Juan Carlos</h1>
        <p>Soy entusiasta de la tecnología y del software libre. Trabajo principalmente en <b>Linux</b> y me interesa el mundo de los <b>servidores web, redes y bases de datos</b>. Disfruto montar entornos desde cero, configurar servicios y aprender nuevas herramientas para mejorar mis proyectos.</p>
        <p>Actualmente estoy profundizando en <b>Apache, PHP y administración de servidores</b>, además de experimentar con bases de datos y despliegue en la nube.</p>

        <hr className="divider" />

        <h2>🛠️ Tecnologías y herramientas</h2>
        <div className="badges-container">
            <img src="https://img.shields.io/badge/Linux-000000?style=flat&logo=linux&logoColor=white" alt="Linux Badge" />
            <img src="https://img.shields.io/badge/Apache-000000?style=flat&logo=apache&logoColor=white" alt="Apache Badge" />
            <img src="https://img.shields.io/badge/PHP-000000?style=flat&logo=php&logoColor=white" alt="PHP Badge" />
            <img src="https://img.shields.io/badge/MySQL-000000?style=flat&logo=mysql&logoColor=white" alt="MySQL Badge" />
            <img src="https://img.shields.io/badge/SQL%20Server-000000?style=flat&logo=microsoftsqlserver&logoColor=white" alt="SQL Server Badge" />
            <img src="https://img.shields.io/badge/HTML5-000000?style=flat&logo=html5&logoColor=white" alt="HTML5 Badge" />
            <img src="https://img.shields.io/badge/CSS3-000000?style=flat&logo=css3&logoColor=white" alt="CSS3 Badge" />
            <img src="https://img.shields.io/badge/JavaScript-000000?style=flat&logo=javascript&logoColor=white" alt="JavaScript Badge" />
            <img src="https://img.shields.io/badge/Git-000000?style=flat&logo=git&logoColor=white" alt="Git Badge" />
            <img src="https://img.shields.io/badge/GitHub-000000?style=flat&logo=github&logoColor=white" alt="GitHub Badge" />
        </div>

        <hr className="divider" />

        <h2>📊 Mis estadísticas en GitHub</h2>
        <div className="github-stats-container">
            <img src="https://github-readme-stats.vercel.app/api?username=junkun123&show_icons=true&theme=transparent" alt="Juan Carlos GitHub stats" />
            <img src="https://github-readme-stats.vercel.app/api/top-langs/?username=junkun123&layout=compact&theme=transparent" alt="Top Lenguajes" />
        </div>

        <hr className="divider" />

        <h2>📬 Contacto</h2>
        <p>Si quieres hablar sobre proyectos, servidores o desarrollo web:</p>
        <p>📧 <b><a href="mailto:jjuancitop1@gmail.com">jjuancitop1@gmail.com</a></b></p>
    </div>
);

export default Profile;