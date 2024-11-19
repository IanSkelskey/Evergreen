# ------------------------------------------------------------------------------
# Module:       OpenILS::Application::Recaptcha
# Author:       Ian Skelskey <ianskelskey@gmail.com>
# Organization: Bibliomation, Inc.
# Year:         2024
# Description:  This module implements the reCAPTCHA v3 verification process within
#               the Evergreen ILS, as an OpenSRF service, using Google's reCAPTCHA 
#               API to validate user input.
# ------------------------------------------------------------------------------

package OpenILS::Application::Recaptcha;

use strict;
use warnings;
use base 'OpenSRF::Application';
use LWP::UserAgent;
use JSON;
use OpenSRF::Utils::Logger qw($logger);

# Register the OpenSRF method
__PACKAGE__->register_method(
    method => 'recaptcha_verify',
    api_name => 'biblio.recaptcha.verify',
    argc => 1,  # Expecting one argument (the reCAPTCHA token)
    stream => 0 # It's not a streaming method
);

# Retrieve the reCAPTCHA secret key from library settings
sub get_secret_key {
    my ($org) = @_;
    my $mgr = OpenSRF::Utils::SettingsClient->new;
    my $secret_key = $mgr->ou_ancestor_setting_value($org, 'recaptcha.secret_key');
    return $secret_key;
}

sub recaptcha_verify {
    my ($self, $client, $recaptcha_response) = @_;

    $logger->info("Verifying reCAPTCHA token");

    my $response = send_recaptcha_request($recaptcha_response);
    my $result = process_recaptcha_response($response);

    return encode_json($result);    # Always return encoded JSON
}

sub send_recaptcha_request {
    my ($recaptcha_response) = @_;

    my $secret = get_secret_key($client->session->requestor->home_ou);

    unless ($secret) {
        $logger->error("reCAPTCHA secret key not found in library settings");
        return { success => 0, error => 'reCAPTCHA secret key not found' };
    }

    my $url = 'https://www.google.com/recaptcha/api/siteverify';

    my $ua = LWP::UserAgent->new(timeout => 10);
    my $response = $ua->post($url, {
        secret   => $secret,
        response => $recaptcha_response
    });

    unless ($response->is_success) {
        $logger->error("Failed to reach Google reCAPTCHA server: " . $response->status_line);
        return { success => 0, error => 'Failed to reach reCAPTCHA server' };
    }

    return $response;
}

sub process_recaptcha_response {
    my ($response) = @_;

    my $content = $response->decoded_content || '{}';
    my $json;
    my $result;

    eval {
        $json = decode_json($content);
    };
    if ($@) { # Catch JSON decoding errors
        $logger->error("Error decoding JSON response from Google: $@");
        return { success => 0, error => 'Invalid JSON response from Google' };
    }
    unless ($json->{'success'}) { # reCAPTCHA failed
        $logger->error("reCAPTCHA failed: " . join(", ", @{$json->{'error-codes'}}));
        return { success => 0, 'error-codes' => $json->{'error-codes'} };
    }
    # reCAPTCHA verified successfully
    if ($json->{'score'} < 0.5) {
        $logger->warn("reCAPTCHA score is below threshold: " . $json->{'score'});
        return { success => 0, error => 'reCAPTCHA score is below threshold' };
    }

    $logger->info("reCAPTCHA verified successfully");
    return { success => 1 };
}

1;
