package OpenILS::WWW::EGCatLoader;
use strict; use warnings;
use Apache2::Const -compile => qw(OK DECLINED FORBIDDEN HTTP_INTERNAL_SERVER_ERROR REDIRECT HTTP_BAD_REQUEST);
use OpenSRF::Utils::Logger qw/$logger/;
use DateTime;
use DateTime::Format::ISO8601;
use OpenILS::Utils::CStoreEditor qw/:funcs/;
use OpenILS::Utils::Fieldmapper;
use OpenILS::Application::AppUtils;
my $U = 'OpenILS::Application::AppUtils';

# context additions: 
#   library : aou object
#   parent: aou object
sub load_library {
    my $self = shift;
    my %kwargs = @_;
    my $ctx = $self->ctx;
    $ctx->{page} = 'library';  

    $self->timelog("load_library() began");

    my $lib_id = $ctx->{page_args}->[0];
    $lib_id = $self->_resolve_org_id_or_shortname($lib_id);

    return Apache2::Const::HTTP_BAD_REQUEST unless $lib_id;

    my $aou = $ctx->{get_aou}->($lib_id);
    my $sname = $aou->parent_ou;

    $ctx->{library} = $aou;
    if ($aou->parent_ou) {
        $ctx->{parent} = $ctx->{get_aou}->($aou->parent_ou);
    }

    $self->timelog("got basic lib info");

    # Mailing address and hours of operation.  Both are memcached by the
    # shared accessors in Util.pm.
    $ctx->{mailing_address} = $ctx->{get_org_address}->($lib_id);
    $ctx->{hours} = $ctx->{get_org_hours}->($lib_id);

    # Get upcoming closed dates
    my $dt = DateTime->now(time_zone => 'local');
    my $start = $dt->year .'-'. $dt->month .'-'. $dt->day;

    my $dates = $self->editor->search_actor_org_unit_closed_date([
        {close_end => { ">=" => $start },
            org_unit => $lib_id
        },
        {order_by => {aoucd => 'close_start'},
            limit => 10
        }
    ]);

    $ctx->{closed_dates} = $dates;

    return Apache2::Const::OK;
}

1;
