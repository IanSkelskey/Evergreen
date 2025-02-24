document.addEventListener('DOMContentLoaded', () => {
    function initializeRecaptcha(formId, siteKey, actionName, submitAction) {
        console.log('Initializing reCAPTCHA for form:', formId);
        const form = document.getElementById(formId);
        if (!form) {
            console.log('Form not found:', formId);
            return;
        }

        // Create and append reCAPTCHA container dynamically
        const recaptchaContainer = createRecaptchaContainer();
        form.appendChild(recaptchaContainer);
        console.log('reCAPTCHA container appended to form:', formId);

        // Add event listener to the form for reCAPTCHA validation
        form.addEventListener('submit', event => {
            event.preventDefault();
            console.log('Form submit action intercepted:', submitAction);
            grecaptcha.ready(() => {
                console.log('Executing reCAPTCHA with siteKey:', siteKey, 'and actionName:', actionName);
                grecaptcha.execute(siteKey, { action: actionName })
                    .then(token => handleRecaptchaToken(token, form));
            });
        });

        function createRecaptchaContainer() {
            const container = document.createElement('div');
            container.id = 'recaptcha-container';
            console.log('Created reCAPTCHA container');
            return container;
        }

        function handleRecaptchaToken(token, form) {
            console.log('Received reCAPTCHA token:', token);
            console.log('Sending reCAPTCHA verification request...');
            const session = new OpenSRF.ClientSession('biblio.recaptcha');
            const request = session.request('biblio.recaptcha.verify', {
                token,
                org_unit: form.dataset.orgUnit
            });

            request.oncomplete = response => processRecaptchaResponse(response, form);
            request.send();
            console.log('reCAPTCHA verification request sent');
        }

        function processRecaptchaResponse(response, form) {
            console.log('Processing reCAPTCHA response...');
            let msg;
            while ((msg = response.recv())) {
                try {
                    const responseContent = JSON.parse(msg.content());
                    console.log('reCAPTCHA response:', responseContent);
                    if (responseContent.success === 1) {
                        console.log('reCAPTCHA validation successful');
                        form.submit();
                    } else {
                        console.log('reCAPTCHA validation failed');
                        alert('reCAPTCHA validation failed. Please try again.');
                    }
                } catch (error) {
                    console.error('Error parsing reCAPTCHA response as JSON:', error);
                    alert('Error in reCAPTCHA validation. Please try again.');
                }
            }
        }
    }

    // Export the function to be used in other scripts
    window.initializeRecaptcha = initializeRecaptcha;
});