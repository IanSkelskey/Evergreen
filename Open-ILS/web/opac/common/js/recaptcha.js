document.addEventListener('DOMContentLoaded', () => {
    function initializeRecaptcha(formId, siteKey, actionName, submitAction) {
        const form = document.getElementById(formId);
        if (!form) return;

        // Create and append reCAPTCHA container dynamically
        const recaptchaContainer = createRecaptchaContainer();
        form.appendChild(recaptchaContainer);

        // Add event listener to the form for reCAPTCHA validation
        form.addEventListener(submitAction, event => {
            event.preventDefault();
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            grecaptcha.ready(() => {
                grecaptcha.execute(siteKey, { action: actionName })
                    .then(token => handleRecaptchaToken(token, form));
            });
        });

        function createRecaptchaContainer() {
            const container = document.createElement('div');
            container.id = 'recaptcha-container';
            return container;
        }

        function handleRecaptchaToken(token, form) {
            console.log('Sending reCAPTCHA verification request...');
            const session = new OpenSRF.ClientSession('biblio.recaptcha');
            const request = session.request('biblio.recaptcha.verify', {
                token,
                org_unit: form.dataset.orgUnit
            });

            request.oncomplete = response => processRecaptchaResponse(response, form);
            request.send();
        }

        function processRecaptchaResponse(response, form) {
            let msg;
            while ((msg = response.recv())) {
                try {
                    const responseContent = JSON.parse(msg.content());
                    console.log('reCAPTCHA response:', responseContent);
                    if (responseContent.success === 1) {
                        form.submit();
                    } else {
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